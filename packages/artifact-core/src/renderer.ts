import type { ArtifactType } from "./types";

export interface RenderResult {
  /** HTML document string to load into the sandboxed preview iframe (via srcdoc). */
  html: string;
}

export interface CompileResult {
  /** Compiled JS/HTML ready to hand to render(), or errors if compilation failed. */
  ok: boolean;
  output?: string;
  errors?: string[];
}

/**
 * Contract every renderer plugin implements (packages/renderers/*). New
 * artifact types are added by creating a new package that satisfies this
 * interface and registering it in the frontend's renderer registry -
 * core logic and other renderers never need to change.
 */
export interface ArtifactRenderer {
  type: ArtifactType;
  /** True if source must go through compile() before render(). */
  needsCompile: boolean;
  compile?(source: string): Promise<CompileResult>;
  render(source: string): Promise<RenderResult>;
}
