import type { ArtifactRenderer, RenderResult } from "@satchel/artifact-core";

/**
 * Images are read as binary and handed in as a data: URL by the caller
 * (this renderer never touches the filesystem) - keeps the render() contract
 * uniform across text and binary artifact types.
 */
export const imageRenderer: ArtifactRenderer = {
  type: "image",
  needsCompile: false,
  async render(dataUrl: string): Promise<RenderResult> {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a1a}
      img{max-width:100%;max-height:100%;object-fit:contain}
    </style></head><body><img src="${dataUrl}" /></body></html>`;
    return { html };
  },
};

export default imageRenderer;
