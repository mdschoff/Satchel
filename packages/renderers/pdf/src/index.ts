import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

/** Same data: URL contract as the image renderer; relies on the webview's built-in PDF viewer. */
export const pdfRenderer: ArtifactRenderer = {
  type: "pdf",
  needsCompile: false,
  async render(dataUrl: string): Promise<RenderResult> {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      html,body,embed{margin:0;width:100%;height:100%}
    </style></head><body><embed src="${dataUrl}" type="application/pdf" /></body></html>`;
    return { html };
  },
};

export default pdfRenderer;
