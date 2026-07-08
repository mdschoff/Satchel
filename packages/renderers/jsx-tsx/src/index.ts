import * as esbuild from "esbuild-wasm";
import esbuildWasmUrl from "esbuild-wasm/esbuild.wasm?url";
import type { ArtifactRenderer, CompileResult, RenderResult } from "@satchel/artifact-core";
import { getReactRuntimeBundle } from "./react-runtime";

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({ wasmURL: esbuildWasmUrl });
  }
  return initPromise;
}

export const jsxTsxRenderer: ArtifactRenderer = {
  type: "tsx",
  needsCompile: true,

  async compile(source: string): Promise<CompileResult> {
    await ensureInitialized();
    try {
      const result = await esbuild.transform(source, {
        loader: "tsx",
        // Classic transform compiles JSX to React.createElement(...) calls
        // against a global `React`, rather than importing "react/jsx-runtime" -
        // pairs with the bundled runtime in render() instead of a CDN import map.
        jsx: "transform",
        format: "esm",
      });
      return { ok: true, output: result.code };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errors: [message] };
    }
  },

  async render(compiledSource: string): Promise<RenderResult> {
    const reactRuntime = await getReactRuntimeBundle();

    // Compiled output is handed back as a data: URL module so we can import()
    // it and read its `default` export directly, rather than trying to splice
    // an `export default` statement into a scope where it'd be unreadable.
    const encoded = btoa(unescape(encodeURIComponent(compiledSource)));
    const moduleDataUrl = `data:text/javascript;base64,${encoded}`;

    const html = `<!doctype html><html><head><meta charset="utf-8" />
<script>${reactRuntime}</script>
</head><body>
<div id="root"></div>
<script type="module">
  const mod = await import("${moduleDataUrl}");
  const Component = mod.default;
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Component));
</script>
</body></html>`;
    return { html };
  },
};

export default jsxTsxRenderer;
