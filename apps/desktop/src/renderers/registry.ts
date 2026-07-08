import type { ArtifactRenderer, ArtifactType } from "@satchel/artifact-core";
import { htmlRenderer } from "@satchel/renderer-html";
import { svgRenderer } from "@satchel/renderer-svg";
import { markdownRenderer } from "@satchel/renderer-markdown";
import { jsxTsxRenderer } from "@satchel/renderer-jsx-tsx";
import { imageRenderer } from "@satchel/renderer-image";
import { pdfRenderer } from "@satchel/renderer-pdf";

/**
 * Adding a new artifact type means adding one line here (plus the package
 * that implements it) - nothing else in the app branches on artifact type.
 */
export const rendererRegistry: Record<ArtifactType, ArtifactRenderer> = {
  html: htmlRenderer,
  svg: svgRenderer,
  markdown: markdownRenderer,
  jsx: jsxTsxRenderer,
  tsx: jsxTsxRenderer,
  image: imageRenderer,
  pdf: pdfRenderer,
};

export function getRenderer(type: ArtifactType): ArtifactRenderer {
  return rendererRegistry[type];
}
