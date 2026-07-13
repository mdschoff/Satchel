/**
 * Best-effort classification of pasted text into an artifact type, plus a
 * sensible title, so ⌘V in a project drops straight into the library.
 * Only text types are possible from a plain-text paste - binary types
 * (image/pdf) still arrive via file import.
 */

export interface SniffedContent {
  artifactType: "svg" | "html" | "markdown";
  title: string;
}

function firstMatch(content: string, re: RegExp): string | null {
  const m = content.match(re);
  return m?.[1]?.trim() || null;
}

export function sniffContent(raw: string): SniffedContent {
  const content = raw.trim();
  const lower = content.toLowerCase();

  if (lower.startsWith("<svg") || /^<\?xml[^>]*>\s*<svg/i.test(content)) {
    return {
      artifactType: "svg",
      title: firstMatch(content, /<title[^>]*>([^<]+)<\/title>/i) ?? "Pasted SVG",
    };
  }

  const looksHtml =
    lower.startsWith("<!doctype") ||
    lower.startsWith("<html") ||
    /<(div|body|head|script|style|section|main|table|p|h[1-6])[\s>]/i.test(content);
  if (looksHtml) {
    return {
      artifactType: "html",
      title:
        firstMatch(content, /<title[^>]*>([^<]+)<\/title>/i) ??
        firstMatch(content, /<h1[^>]*>([^<]+)<\/h1>/i) ??
        "Pasted HTML",
    };
  }

  return {
    artifactType: "markdown",
    title:
      firstMatch(content, /^#{1,6}\s+(.+)$/m) ??
      // fall back to the first non-empty line, truncated
      (content.split("\n").find((l) => l.trim())?.trim().slice(0, 60) || "Pasted note"),
  };
}
