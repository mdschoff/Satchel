# Architecture

## Stack

- **Tauri 2** - Rust backend + a system webview, rather than Electron. Smaller binaries, and a real sandboxing story for running AI-generated HTML/JS, which matters since that's the whole point of the app.
- **React + TypeScript** frontend, built with Vite.
- **SQLite** for a metadata index, **plain files on disk** for the actual artifacts and organization.

## Window layout

Single persistent window, not a two-window "launcher then workspace" model:

- **Left sidebar** (always visible) - the project index
- **Main pane, browsing** - a grid of artifact cards for the selected project
- **Main pane, artifact open** - the artifact renders live and interactive, filling the space next to the sidebar
- **Chat drawer** - collapsible, attached to the artifact view, closed by default. Scoped to the artifact currently open (not a global assistant) for v1.

## Data model

```
library/
├── projects/
│   ├── <project-id>/
│   │   ├── project.json          # name, color, createdAt/updatedAt, parentId (nested sub-projects)
│   │   └── artifacts/
│   │       └── <artifact-id>/
│   │           ├── manifest.json # title, type, tags, sourceFile, sourceNote, timestamps
│   │           └── source.*      # the actual artifact content
│   └── inbox/                    # default landing spot for unsorted imports
└── index.sqlite                  # metadata cache only - rebuildable from the files above
```

The filesystem is the source of truth. `index.sqlite` exists purely for fast search/list queries and can be regenerated at any time by rescanning `library/projects/**`. Manifests carry a `schemaVersion` so future shape changes can migrate old libraries instead of breaking them.

## Plugin architecture

Two extension points, both defined as TypeScript interfaces in `packages/artifact-core` and `packages/ai-providers/provider-interface`:

- **`ArtifactRenderer`** - `detect`/`compile`(optional)/`render`. One package per artifact type under `packages/renderers/*`. JSX/TSX is the only type that needs a compile step (via esbuild-wasm) before rendering.
- **`AIProvider`** - a single `edit(request, config)` method. One package per provider under `packages/ai-providers/*`. Cloud providers (Claude, OpenAI, Gemini) take a BYO API key; Ollama talks to a local server with no key required.

Both registries live in `apps/desktop/src/renderers/registry.ts` and `apps/desktop/src/ai/registry.ts` - adding a new type or provider means adding one line there plus the new package, not touching the UI or core logic.

## Rendering/sandboxing

Rendered artifacts load into an `<iframe sandbox="allow-scripts" srcDoc="...">` - no `allow-same-origin`, so artifact code can't reach the host app's state or storage even though it can run scripts.
