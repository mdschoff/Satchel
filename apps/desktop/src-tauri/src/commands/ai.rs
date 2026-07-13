//! In-app AI editing that runs on the user's Claude *subscription* rather than
//! an API key, by shelling out to the locally-installed Claude Code CLI in
//! headless mode (`claude -p … --output-format json`). Whatever `claude` is
//! signed into (Pro/Max subscription or an API key) is what pays for the call.

use std::path::PathBuf;
use std::process::Command;

/// GUI apps launched from Finder/the bundle inherit a minimal PATH that usually
/// omits ~/.local/bin, Homebrew, etc., so resolve `claude` from PATH *and* the
/// common install locations rather than trusting PATH alone.
fn resolve_claude() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join("claude");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    [
        format!("{home}/.local/bin/claude"),
        format!("{home}/.claude/local/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.is_file())
}

/// Runs a one-shot Claude Code edit. Synchronous on purpose: Tauri executes
/// non-async commands off the main thread, so the (potentially many-second)
/// blocking process call won't freeze the webview.
#[tauri::command]
pub fn ai_edit_via_claude_code(prompt: String, model: Option<String>) -> Result<String, String> {
    let bin = resolve_claude().ok_or_else(|| {
        "Claude Code CLI not found. Install it and sign in (`claude`), then try again.".to_string()
    })?;

    let mut cmd = Command::new(&bin);
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("json");
    if let Some(m) = model.filter(|m| !m.trim().is_empty()) {
        cmd.arg("--model").arg(m);
    }
    // Neutral working dir so it doesn't load an unrelated project's CLAUDE.md.
    cmd.current_dir(std::env::temp_dir());

    let output = cmd
        .output()
        .map_err(|e| format!("Couldn't launch Claude Code: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        return Err(if msg.is_empty() {
            "Claude Code exited with an error.".to_string()
        } else {
            format!("Claude Code: {msg}")
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Couldn't parse Claude Code output: {e}"))?;

    if parsed
        .get("is_error")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let msg = parsed
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Claude Code: {msg}"));
    }

    parsed
        .get("result")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Claude Code returned no result.".to_string())
}
