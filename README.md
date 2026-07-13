# Satchel

A local-first desktop workspace for artifacts your AI makes — HTML, SVG, React components, Markdown, images, PDFs. Drag them in, organize them into projects, open them live and interactive, and keep editing them by hand or with AI.

## Why

AI tools generate a lot of one-off, throwaway artifacts. Satchel gives them a permanent, organized home outside any one chat thread — a single window where you can collect, view, edit, and keep working on them.

## Features

**Library**
- Drag-and-drop or file-picker import for HTML, SVG, Markdown, JSX/TSX, images, and PDFs
- Nested project folders, cross-project search (results show which project each match lives in)
- Live thumbnails in the grid — each card renders a real scaled preview of its artifact
- Multi-select (⌘-click) and drag artifacts between projects; right-click menus for move, rename, export, and delete
- Keyboard shortcuts: ⌘K search, ⌘B sidebar, ⌘N new project, ⌘, settings

**Viewing & editing**
- Artifacts open live and interactive (sandboxed iframe — artifact code can't touch app state)
- Built-in code editor with instant re-render
- Per-artifact version history: every save snapshots the previous source, restore is itself non-destructive

**AI editing, two ways**
- **Your API key** — an in-app Ask AI panel with pluggable providers (Claude, OpenAI, Gemini, or a local Ollama model). Keys are stored in the OS keychain, never in plain text.
- **Your subscription** — Satchel runs a local [MCP server](docs/mcp-server.md), so any MCP client (Claude Code, Claude Desktop, Cursor) can list, search, create, and edit artifacts directly. Edits made by an AI client appear in the window live.

**Sharing**
- Export any project to a zip; import it into another Satchel with one click (fresh ids, no collisions)

## Getting started

Requires [pnpm](https://pnpm.io) and the [Rust toolchain](https://rustup.rs).

```bash
pnpm install
pnpm dev
```

To build a distributable app:

```bash
pnpm --filter @satchel/desktop tauri build
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full picture. In short:

- **`apps/desktop`** — the Tauri 2 app (Rust backend + React/TypeScript frontend)
- **`packages/artifact-core`** — shared types, manifest schema, and type-detection logic
- **`packages/renderers/*`** — one package per artifact type, each implementing a shared render interface
- **`packages/ai-providers/*`** — one package per AI provider, each implementing a shared edit interface

New artifact types and new AI providers are added as new packages, not by modifying core logic.

## Storage model

Everything lives in plain files on disk under the app's data directory — the filesystem is the source of truth, and the SQLite index is a rebuildable cache:

```
library/
├── projects/
│   ├── <project-id>/
│   │   ├── project.json
│   │   └── artifacts/
│   │       └── <artifact-id>/
│   │           ├── manifest.json
│   │           ├── source.*
│   │           └── versions/     (snapshots kept before each overwrite)
│   └── inbox/
└── index.sqlite   (rebuildable metadata cache — not the source of truth)
```

Your artifacts never leave your machine unless you export them or point an AI provider at them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and the plugin-authoring guides for adding a new [artifact renderer](docs/adding-a-renderer.md) or [AI provider](docs/adding-an-ai-provider.md).

## License

MIT
