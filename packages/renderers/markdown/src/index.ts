import { marked } from "marked";
import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

export const markdownRenderer: ArtifactRenderer = {
  type: "markdown",
  needsCompile: false,
  async render(source: string): Promise<RenderResult> {
    const body = await marked.parse(source);
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:2rem auto;padding:0 1.5rem;line-height:1.6}
      pre{background:#f5f5f5;padding:1rem;overflow-x:auto;border-radius:6px}
      code{font-family:ui-monospace,monospace}
    </style></head><body>${body}</body></html>`;
    return { html };
  },
};

export default markdownRenderer;
