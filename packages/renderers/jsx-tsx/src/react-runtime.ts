import * as esbuild from "esbuild-wasm";
// Deep-imported via a relative path rather than the bare "react/cjs/..."
// specifier - Vite enforces each package's declared `exports` map for bare
// specifiers, and these internal build files aren't in it. Going through the
// package's own node_modules symlink sidesteps that (a plain file path isn't
// subject to the exports map), and stays stable across version bumps since
// the symlink target, not this literal path, is what changes.
import reactSource from "../node_modules/react/cjs/react.production.js?raw";
import reactDomSource from "../node_modules/react-dom/cjs/react-dom.production.js?raw";
import reactDomClientSource from "../node_modules/react-dom/cjs/react-dom-client.production.js?raw";
import schedulerSource from "../node_modules/scheduler/cjs/scheduler.production.js?raw";

const NAMESPACE = "satchel-react-runtime";
const ENTRY_PATH = "entry.js";

const SOURCES: Record<string, string> = {
  react: reactSource,
  "react-dom": reactDomSource,
  "react-dom/client": reactDomClientSource,
  scheduler: schedulerSource,
  [ENTRY_PATH]: `
    const React = require("react");
    const ReactDOM = require("react-dom/client");
    module.exports = { React, ReactDOM };
  `,
};

// React's own production CJS builds (from node_modules, not a CDN) resolved
// as in-memory virtual modules - this is what lets JSX/TSX previews run
// without any network access.
const virtualReactPlugin: esbuild.Plugin = {
  name: "satchel-virtual-react",
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom|react-dom\/client|scheduler|entry\.js)$/ }, (args) => ({
      path: args.path,
      namespace: NAMESPACE,
    }));
    build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
      contents: SOURCES[args.path],
      loader: "js",
    }));
  },
};

let runtimePromise: Promise<string> | null = null;

/**
 * Bundles React + ReactDOM into a single IIFE that sets `window.React` /
 * `window.ReactDOM`. Built once and cached in memory for the process
 * lifetime, then inlined as a plain <script> into every artifact preview.
 */
export function getReactRuntimeBundle(): Promise<string> {
  if (!runtimePromise) {
    runtimePromise = esbuild
      .build({
        stdin: {
          contents: `const mod = require("${ENTRY_PATH}"); window.React = mod.React; window.ReactDOM = mod.ReactDOM;`,
          loader: "js",
        },
        bundle: true,
        format: "iife",
        minify: true,
        write: false,
        plugins: [virtualReactPlugin],
      })
      .then((result) => result.outputFiles[0].text);
  }
  return runtimePromise;
}
