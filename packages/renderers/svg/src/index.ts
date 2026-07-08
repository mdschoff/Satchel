import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

export const svgRenderer: ArtifactRenderer = {
  type: "svg",
  needsCompile: false,
  async render(source: string): Promise<RenderResult> {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      /* WebKit collapses an <svg> with no explicit width/height (only a
         viewBox) to 0x0 inside a flex container, unlike Chrome/Firefox which
         fall back to a default size - forcing width/height:100% here sidesteps
         that entirely; viewBox + the default preserveAspectRatio still center
         and scale the actual artwork within that box. */
      html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent}
      svg{width:100%;height:100%}
    </style></head><body>${source}</body></html>`;
    return { html };
  },
};

export default svgRenderer;
