import * as esbuild from "esbuild-wasm";
import esbuildWasmUrl from "esbuild-wasm/esbuild.wasm?url";
import type { ArtifactRenderer, CompileResult, RenderResult } from "@satchel/artifact-core";

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({ wasmURL: esbuildWasmUrl });
  }
  return initPromise;
}

/**
 * React/ReactDOM are loaded from esm.sh inside the sandboxed preview iframe
 * rather than bundled per-artifact - keeps every artifact's compiled output
 * tiny. This is the one place Satchel's rendering needs network access; an
 * offline-bundled fallback is worth revisiting later for fully airgapped use.
 */
const REACT_IMPORT_MAP = {
  imports: {
    react: "https://esm.sh/react@19",
    "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime",
    "react-dom/client": "https://esm.sh/react-dom@19/client",
  },
};

export const jsxTsxRenderer: ArtifactRenderer = {
  type: "tsx",
  needsCompile: true,

  async compile(source: string): Promise<CompileResult> {
    await ensureInitialized();
    try {
      const result = await esbuild.transform(source, {
        loader: "tsx",
        jsx: "automatic",
        format: "esm",
      });
      return { ok: true, output: result.code };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errors: [message] };
    }
  },

  async render(compiledSource: string): Promise<RenderResult> {
    // Compiled output is handed back as a data: URL module so we can import()
    // it and read its `default` export directly, rather than trying to splice
    // an `export default` statement into a scope where it'd be unreadable.
    const encoded = btoa(unescape(encodeURIComponent(compiledSource)));
    const moduleDataUrl = `data:text/javascript;base64,${encoded}`;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
<script type="importmap">${JSON.stringify(REACT_IMPORT_MAP)}</script>
</head><body>
<div id="root"></div>
<script type="module">
  import * as React from "react";
  import { createRoot } from "react-dom/client";
  const mod = await import("${moduleDataUrl}");
  const Component = mod.default;
  createRoot(document.getElementById("root")).render(React.createElement(Component));
</script>
</body></html>`;
    return { html };
  },
};

export default jsxTsxRenderer;
