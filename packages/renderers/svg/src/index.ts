import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

export const svgRenderer: ArtifactRenderer = {
  type: "svg",
  needsCompile: false,
  async render(source: string): Promise<RenderResult> {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent}
      svg{max-width:100%;max-height:100%}
    </style></head><body>${source}</body></html>`;
    return { html };
  },
};

export default svgRenderer;
