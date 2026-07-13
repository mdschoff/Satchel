import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Short git SHA of the build, surfaced in the app's build stamp so a running
// window can be traced back to an exact commit. Falls back gracefully outside
// a git checkout (e.g. a source tarball).
function gitShortSha(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    let dirty = "";
    try {
      execSync("git diff --quiet HEAD");
    } catch {
      dirty = "+"; // uncommitted changes present at build time
    }
    return sha + dirty;
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
// Internal @satchel/* workspace packages are resolved through node_modules
// symlinks, so Vite treats them as "dependencies" and pre-bundles them with
// immutable cache headers keyed off package.json/lockfile fingerprints -
// which never change when we edit their source. Excluding them from dep
// optimization makes Vite transform them as plain source on every request,
// like everything else in this repo, so edits actually take effect.
const workspacePackages = [
  "@satchel/artifact-core",
  "@satchel/renderer-html",
  "@satchel/renderer-svg",
  "@satchel/renderer-markdown",
  "@satchel/renderer-jsx-tsx",
  "@satchel/renderer-image",
  "@satchel/renderer-pdf",
  "@satchel/ai-provider-interface",
  "@satchel/ai-provider-claude",
  "@satchel/ai-provider-openai",
  "@satchel/ai-provider-gemini",
  "@satchel/ai-provider-ollama",
];

export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(gitShortSha()),
  },
  optimizeDeps: {
    exclude: workspacePackages,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // WKWebView (Tauri's macOS webview) persists an on-disk HTTP cache across
    // app relaunches independent of anything Vite itself does - without this,
    // edits to source served by the dev server can silently keep serving a
    // stale response even after a full process restart.
    headers: {
      "Cache-Control": "no-store",
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
