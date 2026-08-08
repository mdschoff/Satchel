//! Rasterizing artifacts for the model to look at, plus the diagnostics that
//! explain what it's looking at.
//!
//! The diagnostics exist because resvg fails *silently* in two ways that both
//! look like a code bug in the resulting image:
//!
//!   1. It never performs network or filesystem fetches. An `<image>` pointing
//!      at an https URL renders as nothing at all - no error, just a blank gap.
//!   2. Missing fonts fall back to whatever else is installed, so text renders
//!      at the wrong size/shape rather than failing.
//!
//! A model that only sees pixels will confidently "fix" perfectly good markup
//! in response to either. Returning the reason alongside the PNG lets it tell a
//! real visual bug apart from a resource that was never going to load.

use schemars::JsonSchema;
use serde::Serialize;

/// A resource the SVG references that will not load during rasterization.
#[derive(Debug, Clone, PartialEq, Serialize, JsonSchema)]
pub struct UnloadableRef {
    /// The referenced URL/path, truncated if long.
    pub href: String,
    /// Why it won't load, in terms the model can act on.
    pub reason: String,
}

/// Everything about a render that isn't the pixels.
#[derive(Debug, Default, Clone, PartialEq, Serialize, JsonSchema)]
pub struct RenderDiagnostics {
    /// Font families the document asks for that aren't installed on this
    /// machine. Text using them is still drawn, but with a substituted face -
    /// so wrong-looking text here is an environment issue, not a markup bug.
    pub missing_fonts: Vec<String>,
    /// References that will render blank because resvg won't fetch them.
    pub unloadable_refs: Vec<UnloadableRef>,
    /// Anything else worth knowing about the render.
    pub notes: Vec<String>,
}

impl RenderDiagnostics {
    pub fn is_clean(&self) -> bool {
        self.missing_fonts.is_empty() && self.unloadable_refs.is_empty() && self.notes.is_empty()
    }

    /// Renders as the text block that accompanies the image in the tool result.
    pub fn summary(&self, width: u32, height: u32) -> String {
        let mut s = format!("Rendered {width}x{height}px.");
        if self.is_clean() {
            s.push_str(" No asset or font problems detected: what you see is what the source says.");
            return s;
        }
        if !self.missing_fonts.is_empty() {
            s.push_str(&format!(
                "\n\nMISSING FONTS ({}): {}\nText using these was drawn with a substitute face. \
                 If the text looks wrong, that's this - not your markup. Embed the font or use \
                 one that's installed.",
                self.missing_fonts.len(),
                self.missing_fonts.join(", ")
            ));
        }
        if !self.unloadable_refs.is_empty() {
            s.push_str(&format!("\n\nBLANK REFERENCES ({}):", self.unloadable_refs.len()));
            for r in &self.unloadable_refs {
                s.push_str(&format!("\n  - {} ({})", r.href, r.reason));
            }
            s.push_str(
                "\nThese rendered as empty space. Inline the asset as a data: URI to make it \
                 appear. Do NOT rewrite surrounding markup to chase the gap.",
            );
        }
        if !self.notes.is_empty() {
            s.push_str("\n\nNOTES:");
            for n in &self.notes {
                s.push_str(&format!("\n  - {n}"));
            }
        }
        s
    }
}

pub struct RenderOutput {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub diagnostics: RenderDiagnostics,
}

/// Generic CSS families are always satisfiable, so never report them missing.
const GENERIC_FAMILIES: &[&str] = &[
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "math",
    "emoji",
    "fangsong",
    "inherit",
    "initial",
    "unset",
];

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let head: String = s.chars().take(max).collect();
    format!("{head}...")
}

/// Pulls the quoted value that follows each occurrence of `marker`.
/// Deliberately not a real XML parse - we only need referenced strings, and a
/// scan can't fail on the malformed markup a model might have just written.
fn quoted_values_after(haystack: &str, marker: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = haystack;
    while let Some(pos) = rest.find(marker) {
        rest = &rest[pos + marker.len()..];
        let mut chars = rest.char_indices().skip_while(|(_, c)| c.is_whitespace());
        // Expect '=' then an optional run of whitespace then a quote.
        let Some((_, '=')) = chars.next() else { continue };
        let mut after_eq = chars.skip_while(|(_, c)| c.is_whitespace());
        let Some((qi, quote)) = after_eq.next() else { continue };
        if quote != '"' && quote != '\'' {
            continue;
        }
        let value_start = qi + quote.len_utf8();
        if let Some(end) = rest[value_start..].find(quote) {
            out.push(rest[value_start..value_start + end].to_string());
        }
    }
    out
}

/// Pulls the target of every `url(...)` occurrence.
fn url_targets(haystack: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = haystack;
    while let Some(pos) = rest.find("url(") {
        rest = &rest[pos + 4..];
        if let Some(end) = rest.find(')') {
            let raw = rest[..end].trim().trim_matches(['"', '\'']).trim();
            if !raw.is_empty() {
                out.push(raw.to_string());
            }
        }
    }
    out
}

/// References that resvg will not resolve, with the reason why.
///
/// `href` covers `xlink:href` too, since the scan matches the suffix.
pub fn unloadable_refs(svg: &str) -> Vec<UnloadableRef> {
    let mut out: Vec<UnloadableRef> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let candidates = quoted_values_after(svg, "href")
        .into_iter()
        .chain(url_targets(svg));

    for href in candidates {
        let h = href.trim();
        // Internal fragments and inline data are fine.
        if h.is_empty() || h.starts_with('#') || h.starts_with("data:") {
            continue;
        }
        let reason = if h.starts_with("http://") || h.starts_with("https://") {
            "remote URL; resvg performs no network requests"
        } else if h.starts_with("file://") {
            "file:// URL; not resolved when rendering from source"
        } else {
            // A bare/relative path. We rasterize from a string with no
            // resources directory, so there is nothing to resolve it against.
            "relative path; no base directory when rendering from source"
        };
        let key = h.to_string();
        if seen.insert(key) {
            out.push(UnloadableRef {
                href: truncate(h, 120),
                reason: reason.to_string(),
            });
        }
    }
    out
}

/// Text of every `<style>...</style>` element.
fn style_element_bodies(svg: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = svg;
    while let Some(pos) = rest.find("<style") {
        rest = &rest[pos..];
        let Some(open_end) = rest.find('>') else { break };
        rest = &rest[open_end + 1..];
        let end = rest.find("</style>").unwrap_or(rest.len());
        out.push(rest[..end].to_string());
        rest = &rest[end..];
    }
    out
}

/// Pulls `font-family` declarations out of a chunk of CSS.
///
/// Only ever called with the *inside* of a `style="..."` attribute or a
/// `<style>` body, so the surrounding delimiter is already stripped and a
/// quoted family name can't be mistaken for the end of the value.
fn css_font_family_values(css: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = css;
    while let Some(pos) = rest.find("font-family") {
        rest = &rest[pos + "font-family".len()..];
        let trimmed = rest.trim_start();
        let Some(after_colon) = trimmed.strip_prefix(':') else { continue };
        let end = after_colon.find([';', '}']).unwrap_or(after_colon.len());
        out.push(after_colon[..end].to_string());
    }
    out
}

/// Font families the document references, minus generic CSS keywords.
pub fn referenced_font_families(svg: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Presentation attribute: font-family="Inter".
    let mut lists = quoted_values_after(svg, "font-family");
    // CSS, from inline style attributes and from <style> bodies.
    for chunk in quoted_values_after(svg, "style")
        .into_iter()
        .chain(style_element_bodies(svg))
    {
        lists.extend(css_font_family_values(&chunk));
    }

    for list in lists {
        for family in list.split(',') {
            let name = family.trim().trim_matches(['"', '\'']).trim();
            if name.is_empty() || GENERIC_FAMILIES.contains(&name.to_ascii_lowercase().as_str()) {
                continue;
            }
            if seen.insert(name.to_ascii_lowercase()) {
                out.push(name.to_string());
            }
        }
    }
    out
}

/// Rasterizes an SVG string to PNG bytes with resvg (pure Rust, no browser),
/// scaling the artwork so the longer side is ~`max_size`px on a white
/// background, and reports what wouldn't load while doing it.
pub fn rasterize_svg(svg: &str, max_size: u32) -> Result<RenderOutput, String> {
    use resvg::tiny_skia;
    use resvg::usvg;

    let mut opt = usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();

    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| e.to_string())?;

    let mut diagnostics = RenderDiagnostics {
        unloadable_refs: unloadable_refs(svg),
        ..Default::default()
    };

    // Ask fontdb directly rather than scraping resvg's log output, so the
    // answer is deterministic and testable.
    let db = &opt.fontdb;
    for family in referenced_font_families(svg) {
        let query = usvg::fontdb::Query {
            families: &[usvg::fontdb::Family::Name(&family)],
            ..Default::default()
        };
        if db.query(&query).is_none() {
            diagnostics.missing_fonts.push(family);
        }
    }

    let target = max_size.clamp(64, 4096) as f32;
    let size = tree.size();
    let max_dim = size.width().max(size.height());
    let uncapped = if max_dim > 0.0 { target / max_dim } else { 1.0 };
    let scale = uncapped.min(4.0);
    if uncapped > 4.0 {
        diagnostics.notes.push(format!(
            "Upscale capped at 4x: the source is only {:.0}x{:.0}px, so the image is smaller \
             than the {max_size}px you asked for.",
            size.width(),
            size.height()
        ));
    }

    let pw = ((size.width() * scale).ceil() as u32).max(1);
    let ph = ((size.height() * scale).ceil() as u32).max(1);

    let mut pixmap = tiny_skia::Pixmap::new(pw, ph).ok_or("failed to allocate pixmap")?;
    pixmap.fill(tiny_skia::Color::WHITE);
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );

    let png = pixmap.encode_png().map_err(|e| e.to_string())?;
    Ok(RenderOutput {
        png,
        width: pw,
        height: ph,
        diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_remote_and_relative_refs_but_not_data_or_fragments() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg">
            <image href="https://example.com/logo.png"/>
            <image xlink:href="data:image/png;base64,AAAA"/>
            <image href="./local/chart.png"/>
            <rect fill="url(#grad)"/>
            <use href="#icon"/>
        </svg>"##;

        let refs = unloadable_refs(svg);
        let hrefs: Vec<_> = refs.iter().map(|r| r.href.as_str()).collect();

        assert!(hrefs.contains(&"https://example.com/logo.png"));
        assert!(hrefs.contains(&"./local/chart.png"));
        // data: URIs, internal fragments and url(#...) all resolve fine.
        assert!(!hrefs.iter().any(|h| h.starts_with("data:")));
        assert!(!hrefs.iter().any(|h| h.starts_with('#')));
        assert_eq!(refs.len(), 2);
    }

    #[test]
    fn does_not_flag_the_svg_namespace_url() {
        // xmlns is not an href, so the namespace must not show up as a broken
        // asset - that would be a false positive on literally every SVG.
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>"#;
        assert!(unloadable_refs(svg).is_empty());
    }

    #[test]
    fn collects_font_families_from_attributes_and_css() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg">
            <style>.t { font-family: Inter, sans-serif; }</style>
            <text font-family="Helvetica Neue">hi</text>
            <text style="font-family:'Fira Code'">yo</text>
        </svg>"#;

        let mut families = referenced_font_families(svg);
        families.sort();
        assert_eq!(families, vec!["Fira Code", "Helvetica Neue", "Inter"]);
    }

    #[test]
    fn generic_families_are_never_reported_missing() {
        let svg = r#"<svg><text font-family="sans-serif, MONOSPACE, system-ui">x</text></svg>"#;
        assert!(referenced_font_families(svg).is_empty());
    }

    #[test]
    fn duplicate_references_are_reported_once() {
        let svg = r#"<svg>
            <image href="https://example.com/a.png"/>
            <image href="https://example.com/a.png"/>
            <text font-family="Inter">a</text><text font-family="inter">b</text>
        </svg>"#;
        assert_eq!(unloadable_refs(svg).len(), 1);
        assert_eq!(referenced_font_families(svg).len(), 1);
    }

    #[test]
    fn renders_a_plain_svg_with_clean_diagnostics() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
            <rect width="100" height="50" fill="red"/>
        </svg>"#;
        let out = rasterize_svg(svg, 200).expect("should render");

        assert!(out.diagnostics.is_clean(), "{:?}", out.diagnostics);
        assert_eq!((out.width, out.height), (200, 100));
        assert_eq!(&out.png[1..4], b"PNG");
    }

    #[test]
    fn notes_when_upscaling_is_capped() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
            <rect width="10" height="10"/>
        </svg>"#;
        // 4096 / 10 would be 409x, far past the 4x cap.
        let out = rasterize_svg(svg, 4096).expect("should render");
        assert_eq!((out.width, out.height), (40, 40));
        assert!(out.diagnostics.notes.iter().any(|n| n.contains("capped")));
    }

    #[test]
    fn summary_tells_the_model_not_to_chase_a_blank_gap() {
        let d = RenderDiagnostics {
            unloadable_refs: vec![UnloadableRef {
                href: "https://example.com/a.png".into(),
                reason: "remote URL; resvg performs no network requests".into(),
            }],
            ..Default::default()
        };
        let s = d.summary(100, 100);
        assert!(s.contains("BLANK REFERENCES"));
        assert!(s.contains("Do NOT rewrite surrounding markup"));
    }

    #[test]
    fn malformed_markup_does_not_panic_the_scanners() {
        for junk in ["<svg href=", "<svg href", "href=\"unterminated", "url(", "font-family:"] {
            let _ = unloadable_refs(junk);
            let _ = referenced_font_families(junk);
        }
    }
}
