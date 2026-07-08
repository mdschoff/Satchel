import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

/**
 * HTML artifacts are rendered as-is inside a sandboxed iframe (sandboxing is
 * applied by the caller via the iframe's `sandbox` attribute, not here). If
 * the source is a fragment rather than a full document, it gets wrapped so it
 * still has a <head>/<body> to attach to.
 */
export const htmlRenderer: ArtifactRenderer = {
  type: "html",
  needsCompile: false,
  async render(source: string): Promise<RenderResult> {
    const isFullDocument = /<html[\s>]/i.test(source);
    if (isFullDocument) {
      return { html: source };
    }
    return {
      html: `<!doctype html><html><head><meta charset="utf-8" /></head><body>${source}</body></html>`,
    };
  },
};

export default htmlRenderer;
