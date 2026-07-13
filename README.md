<p align="center">
  <img src="apps/desktop/src-tauri/icons/source-icon.svg" width="140" alt="Satchel logo" />
</p>

<h1 align="center">Satchel</h1>

<p align="center">
  <a href="https://github.com/mdschoff/satchel/actions/workflows/ci.yml"><img src="https://github.com/mdschoff/satchel/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0" /></a>
</p>

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

### Download

Grab the latest installer from [Releases](https://github.com/mdschoff/satchel/releases) — a universal `.dmg` for macOS (Apple Silicon + Intel) or an `.msi` for Windows. Each release ships a `SHA256SUMS.txt` if you want to verify your download.

> **macOS note:** builds aren't signed with an Apple Developer certificate yet, so the first launch requires **right-click → Open** (once, then it opens normally).

### Run from source

Requires [pnpm](https://pnpm.io) and the [Rust toolchain](https://rustup.rs).

```bash
pnpm install
pnpm dev
```

To build a distributable app yourself:

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

[AGPL-3.0](LICENSE). In short: use it, learn from it, fork it, contribute — but if you distribute a modified version or run one as a service, your changes must stay open source too.
