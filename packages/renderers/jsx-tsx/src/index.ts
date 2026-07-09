import * as esbuild from "esbuild-wasm";
import esbuildWasmUrl from "esbuild-wasm/esbuild.wasm?url";
import type { ArtifactRenderer, CompileResult, RenderResult } from "@satchel/artifact-core";
import { getReactRuntimeBundle, globalReactShimPlugin } from "./react-runtime";

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
      // build() with bundle, not transform(): artifacts import "react" /
      // "react-dom" directly, and transform() leaves those import statements
      // in place - a bare specifier can never resolve from the data: URL
      // module inside the sandboxed iframe, so the preview died before the
      // component ever mounted. The shim plugin aliases those imports to the
      // window globals the runtime <script> provides. Imports of anything
      // outside that set fail here, visibly, as a compile error instead of
      // a blank pane.
      const result = await esbuild.build({
        stdin: { contents: source, loader: "tsx" },
        bundle: true,
        format: "esm",
        write: false,
        // Classic transform compiles JSX to React.createElement(...) calls
        // against a global `React`, rather than importing "react/jsx-runtime" -
        // pairs with the bundled runtime in render() so artifacts that never
        // import React still render.
        jsx: "transform",
        plugins: [globalReactShimPlugin],
      });
      return { ok: true, output: result.outputFiles[0].text };
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

    // Errors thrown inside the iframe (module evaluation, React render,
    // event handlers) never propagate to the host window, so without the
    // bridge below they'd leave the preview blank with no indication why.
    const html = `<!doctype html><html><head><meta charset="utf-8" />
<script>
  function __satchelShowError(message) {
    var pre = document.createElement("pre");
    pre.style.cssText = "margin:16px;padding:12px;white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,monospace;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;";
    pre.textContent = "Preview error: " + message;
    document.body.appendChild(pre);
  }
  window.addEventListener("error", function (e) { __satchelShowError(e.message); });
  window.addEventListener("unhandledrejection", function (e) {
    __satchelShowError(e.reason && e.reason.message ? e.reason.message : String(e.reason));
  });
</script>
<script>${reactRuntime}</script>
</head><body>
<div id="root"></div>
<script type="module">
  const mod = await import("${moduleDataUrl}");
  const Component = mod.default;
  if (typeof Component !== "function") {
    throw new Error("Artifact must default-export a React component.");
  }
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Component));
</script>
</body></html>`;
    return { html };
  },
};

export default jsxTsxRenderer;
