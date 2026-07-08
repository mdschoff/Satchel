import type { ArtifactType } from "./types";

const EXTENSION_MAP: Record<string, ArtifactType> = {
  html: "html",
  htm: "html",
  svg: "svg",
  md: "markdown",
  markdown: "markdown",
  jsx: "jsx",
  tsx: "tsx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  pdf: "pdf",
};

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Best-effort sniff of artifact type from raw text content, used when a file
 * has no extension (e.g. pasted content). Order matters: more specific/rare
 * signatures are checked before generic ones.
 */
function sniffFromContent(content: string): ArtifactType | null {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml") && trimmed.includes("<svg")) {
    return "svg";
  }
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return "html";
  }
  if (/^import\s.+from\s+["']react["']/m.test(trimmed) || /<[A-Z][A-Za-z0-9]*[\s/>]/.test(trimmed)) {
    return "tsx";
  }
  if (/^#{1,6}\s/m.test(trimmed) || /^```/m.test(trimmed)) {
    return "markdown";
  }
  return null;
}

/**
 * Detects an artifact's type from its filename first, falling back to content
 * sniffing when there's no recognized extension (e.g. extensionless paste-ins).
 */
export function detectArtifactType(filename: string, content?: string): ArtifactType | null {
  const ext = extensionOf(filename);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext];
  }
  if (content) {
    return sniffFromContent(content);
  }
  return null;
}
