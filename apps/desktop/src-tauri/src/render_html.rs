//! PROTOTYPE (macOS only): render an HTML artifact offscreen in a real
//! WKWebView and capture both the pixels and what went wrong producing them.
//!
//! This is the spike for issue #8. It answers the question that decides the
//! whole approach: can we snapshot a webview the user never sees, and get
//! genuine console/resource diagnostics out of it, without adding a headless
//! Chrome dependency?
//!
//! Why a real webview rather than a rasterizer: HTML needs layout, the CSS
//! cascade, and JS execution. The app already embeds an engine that does all
//! three, and using it means "what the model sees" is literally the same
//! renderer as "what the user sees" in the preview pane.
//!
//! Drive it with:
//!   SATCHEL_PROTOTYPE_RENDER_HTML=/tmp/out.png pnpm dev
//!
//! Not wired into the MCP surface yet - that comes once the approach is
//! proven and the Windows half exists.

use std::sync::mpsc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{NSDictionary, NSError, NSString};
use objc2_web_kit::WKWebView;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Installed before any page script runs, so it catches errors thrown during
/// initial evaluation - which is exactly when a broken artifact fails.
const DIAGNOSTIC_SCRIPT: &str = r#"
(function () {
  window.__satchelDiag = { console: [], resources: [] };
  var origError = console.error;
  console.error = function () {
    try {
      window.__satchelDiag.console.push(
        Array.prototype.map.call(arguments, String).join(' ')
      );
    } catch (_) {}
    return origError.apply(console, arguments);
  };
  // Capture phase: resource load failures (img/script/link) do not bubble.
  window.addEventListener('error', function (e) {
    try {
      var t = e.target;
      if (t && t !== window && (t.src || t.href)) {
        window.__satchelDiag.resources.push(
          (t.tagName || '?') + ' ' + (t.src || t.href)
        );
      } else {
        window.__satchelDiag.console.push(
          String(e.message) + ' @' + (e.filename || '') + ':' + (e.lineno || 0)
        );
      }
    } catch (_) {}
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    try {
      window.__satchelDiag.console.push('Unhandled rejection: ' + String(e.reason));
    } catch (_) {}
  });
})();
"#;

#[derive(Debug, Default)]
pub struct HtmlDiagnostics {
    pub console_errors: Vec<String>,
    pub failed_resources: Vec<String>,
}

pub struct HtmlRenderOutput {
    pub png: Vec<u8>,
    pub diagnostics: HtmlDiagnostics,
}

/// Builds the offscreen webview. Must be called on the main thread.
///
/// The window is positioned far off-screen rather than created hidden: a
/// window with `visible(false)` isn't composited on macOS, and snapshots of it
/// come back blank. Moving it outside the display bounds keeps it live (so it
/// actually renders) while staying invisible to the user.
pub fn build_offscreen_webview(
    app: &AppHandle,
    label: &str,
    width: u32,
    height: u32,
) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse().unwrap()))
        .title("Satchel offscreen render")
        .inner_size(width as f64, height as f64)
        .position(-32000.0, -32000.0)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .initialization_script(DIAGNOSTIC_SCRIPT)
        .build()
        .map_err(|e| format!("failed to build offscreen webview: {e}"))
}

/// Runs `js` in the webview and returns its result stringified.
///
/// Blocks, so never call this from the main thread - `with_webview` dispatches
/// the work *to* the main thread and we would deadlock waiting on ourselves.
fn eval(webview: &WebviewWindow, js: &str, timeout: Duration) -> Result<String, String> {
    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let js = js.to_string();

    webview
        .with_webview(move |platform| {
            let wk: &WKWebView = unsafe { &*(platform.inner() as *mut WKWebView) };
            let script = NSString::from_str(&js);
            let handler = RcBlock::new(move |result: *mut AnyObject, err: *mut NSError| {
                let out = if !err.is_null() {
                    let msg = unsafe { (*err).localizedDescription() };
                    Err(msg.to_string())
                } else if result.is_null() {
                    Ok(String::new())
                } else {
                    // Every script here returns a JS string, which bridges to
                    // NSString. Downcast rather than assume, so a future
                    // non-string result degrades instead of misreading memory.
                    let obj: &AnyObject = unsafe { &*result };
                    match obj.downcast_ref::<NSString>() {
                        Some(s) => Ok(s.to_string()),
                        None => Ok(format!("{obj:?}")),
                    }
                };
                let _ = tx.send(out);
            });
            unsafe { wk.evaluateJavaScript_completionHandler(&script, Some(&handler)) };
        })
        .map_err(|e| format!("with_webview failed: {e}"))?;

    rx.recv_timeout(timeout)
        .map_err(|_| format!("JS evaluation timed out after {timeout:?}"))?
}

/// Loads a raw HTML string into the webview.
///
/// `loadHTMLString:` rather than a data: URL or a temp file: WKWebView refuses
/// top-level data: navigations, and a file:// load would need read-access
/// grants. This keeps the artifact source in memory.
fn load_html(webview: &WebviewWindow, html: &str) -> Result<(), String> {
    let html = html.to_string();
    webview
        .with_webview(move |platform| {
            let wk: &WKWebView = unsafe { &*(platform.inner() as *mut WKWebView) };
            let s = NSString::from_str(&html);
            unsafe { wk.loadHTMLString_baseURL(&s, None) };
        })
        .map_err(|e| format!("with_webview failed: {e}"))
}

/// Waits until *our* document - not the one it replaced - has fully loaded.
///
/// Polling `document.readyState` alone is a trap: `loadHTMLString:` is
/// asynchronous, so the first evaluation lands on the outgoing `about:blank`,
/// which is already `complete`. The wait then returns instantly, diagnostics
/// get collected before any page script has run, and the snapshot taken later
/// still looks correct - so the bug reads as "diagnostics don't work" rather
/// than "we never waited".
///
/// The token element is appended to the source, so seeing it in the DOM proves
/// the parser reached the end of the document we just handed over. It's a DOM
/// node rather than a script global on purpose: it must not depend on the page
/// executing JS, since a page whose JS is broken is exactly what we're here to
/// diagnose.
fn wait_for_load(webview: &WebviewWindow, token: &str, timeout: Duration) -> Result<(), String> {
    let probe = format!(
        "(function(){{var e=document.getElementById('__satchel_render_token');\
          return (e && e.getAttribute('data-token')==='{token}' \
          && document.readyState==='complete') ? 'ready' : 'waiting';}})()"
    );

    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() > deadline {
            return Err("timed out waiting for the rendered document to finish loading".into());
        }
        if let Ok(state) = eval(webview, &probe, Duration::from_secs(5)) {
            if state.trim() == "ready" {
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(25));
    }

    // Two rAFs guarantee a committed paint.
    let _ = eval(
        webview,
        "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r('ok'))))",
        Duration::from_secs(5),
    );
    Ok(())
}

fn collect_diagnostics(webview: &WebviewWindow) -> HtmlDiagnostics {
    // Distinguish "the hook ran and found nothing" from "the hook never ran".
    // Without this, a missing init script is indistinguishable from a clean
    // page - which is the worst possible failure mode for a diagnostic.
    match eval(webview, "typeof window.__satchelDiag", Duration::from_secs(5)) {
        Ok(t) if t.trim() == "object" => {}
        Ok(t) => tracing::warn!(
            "diagnostic hook missing (typeof __satchelDiag = {t:?}); \
             the initialization script did not run for this navigation"
        ),
        Err(e) => tracing::warn!("could not probe for the diagnostic hook: {e}"),
    }

    let raw = eval(
        webview,
        "JSON.stringify(window.__satchelDiag || {console:[],resources:[]})",
        Duration::from_secs(5),
    )
    .unwrap_or_default();
    tracing::debug!("raw diagnostics payload: {raw}");

    #[derive(serde::Deserialize, Default)]
    struct Raw {
        #[serde(default)]
        console: Vec<String>,
        #[serde(default)]
        resources: Vec<String>,
    }
    let parsed: Raw = serde_json::from_str(&raw).unwrap_or_default();
    HtmlDiagnostics {
        console_errors: parsed.console,
        failed_resources: parsed.resources,
    }
}

/// Snapshots the webview's current contents to PNG bytes.
fn snapshot_png(webview: &WebviewWindow, timeout: Duration) -> Result<Vec<u8>, String> {
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

    webview
        .with_webview(move |platform| {
            let wk: &WKWebView = unsafe { &*(platform.inner() as *mut WKWebView) };
            let handler = RcBlock::new(move |image: *mut NSImage, err: *mut NSError| {
                let out = (|| -> Result<Vec<u8>, String> {
                    if !err.is_null() {
                        return Err(unsafe { (*err).localizedDescription() }.to_string());
                    }
                    if image.is_null() {
                        return Err("takeSnapshot returned no image".into());
                    }
                    let image = unsafe { &*image };
                    let tiff = image.TIFFRepresentation()
                        .ok_or("NSImage had no TIFF representation")?;
                    let rep = NSBitmapImageRep::imageRepWithData(&tiff)
                        .ok_or("could not build a bitmap rep from the snapshot")?;
                    let props = NSDictionary::new();
                    let png = unsafe {
                        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props)
                    }
                    .ok_or("PNG encoding failed")?;
                    Ok(png.to_vec())
                })();
                let _ = tx.send(out);
            });
            // None = default configuration: snapshot the visible viewport.
            unsafe { wk.takeSnapshotWithConfiguration_completionHandler(None, &handler) };
        })
        .map_err(|e| format!("with_webview failed: {e}"))?;

    rx.recv_timeout(timeout)
        .map_err(|_| format!("snapshot timed out after {timeout:?}"))?
}

/// Full offscreen render. Blocking; call from a worker thread.
pub fn render_html(
    webview: &WebviewWindow,
    html: &str,
    timeout: Duration,
) -> Result<HtmlRenderOutput, String> {
    // Appended, not injected into <head>: lenient HTML parsing puts a trailing
    // element in the body regardless of how malformed the artifact is, and it
    // only becomes visible to the probe once parsing reaches the very end.
    let token = uuid::Uuid::new_v4().to_string();
    let instrumented = format!(
        "{html}<div id=\"__satchel_render_token\" data-token=\"{token}\" style=\"display:none\"></div>"
    );

    load_html(webview, &instrumented)?;
    wait_for_load(webview, &token, timeout)?;
    let diagnostics = collect_diagnostics(webview);
    let png = snapshot_png(webview, timeout)?;
    Ok(HtmlRenderOutput { png, diagnostics })
}

/// Exercises the whole path when `SATCHEL_PROTOTYPE_RENDER_HTML` names an
/// output file. Called from `setup()`, so the window is built on the main
/// thread and the blocking render happens on a worker.
pub fn run_prototype_if_requested(app: &AppHandle) {
    let Ok(out_path) = std::env::var("SATCHEL_PROTOTYPE_RENDER_HTML") else {
        return;
    };

    // Deliberately broken in three ways, one per diagnostic channel.
    const SAMPLE: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; font-family: -apple-system, system-ui, sans-serif; background:#f5f0e8; }
  .card { padding:32px; }
  h1 { color:#8a5a2b; margin:0 0 8px; font-size:34px; }
  .row { display:flex; gap:16px; align-items:center; margin-top:20px; }
  .swatch { width:72px; height:72px; border-radius:12px; background:#cf9b5a; }
</style></head>
<body><div class="card">
  <h1>Satchel offscreen render</h1>
  <p>If you can read this in a PNG, WKWebView snapshotting works.</p>
  <div class="row">
    <div class="swatch"></div>
    <img src="https://example.invalid/missing.png" width="72" height="72" alt="broken">
  </div>
  <script src="https://example.invalid/missing.js"></script>
  <script>
    console.error('deliberate console error from the artifact');
    Promise.reject(new Error('deliberate unhandled rejection'));
  </script>
</div></body></html>"#;

    let (w, h) = (900u32, 600u32);
    let window = match build_offscreen_webview(app, "satchel-prototype-render", w, h) {
        Ok(win) => win,
        Err(e) => {
            tracing::error!("prototype: {e}");
            return;
        }
    };

    std::thread::spawn(move || {
        // Give the about:blank shell a moment before the first evaluate.
        std::thread::sleep(Duration::from_millis(300));
        let started = Instant::now();
        match render_html(&window, SAMPLE, Duration::from_secs(20)) {
            Ok(out) => {
                let elapsed = started.elapsed();
                match std::fs::write(&out_path, &out.png) {
                    Ok(()) => tracing::info!(
                        "prototype: wrote {} bytes of PNG to {out_path} in {elapsed:?}",
                        out.png.len()
                    ),
                    Err(e) => tracing::error!("prototype: could not write {out_path}: {e}"),
                }
                tracing::info!(
                    "prototype: console_errors={:?} failed_resources={:?}",
                    out.diagnostics.console_errors,
                    out.diagnostics.failed_resources
                );
            }
            Err(e) => tracing::error!("prototype: render failed: {e}"),
        }
        let _ = window.close();
    });
}
