<p align="center">
  <img src="apps/desktop/src-tauri/icons/source-icon.svg" width="140" alt="Satchel logo" />
</p>

<h1 align="center">Satchel</h1>

<p align="center"><strong>A permanent, local home for the artifacts your AI makes.</strong></p>

<p align="center">
  <a href="https://github.com/mdschoff/satchel/actions/workflows/ci.yml"><img src="https://github.com/mdschoff/satchel/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mdschoff/satchel/releases/latest"><img src="https://img.shields.io/github/v/release/mdschoff/satchel?color=cf9b5a" alt="Latest release" /></a>
  <a href="https://github.com/mdschoff/satchel/releases"><img src="https://img.shields.io/github/downloads/mdschoff/satchel/total?color=cf9b5a" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0" /></a>
</p>

<p align="center">
  <a href="#download">Download</a> ·
  <a href="docs/mcp-server.md">MCP server</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="https://github.com/mdschoff/satchel/issues">Bug reports</a> ·
  <a href="https://github.com/sponsors/mdschoff">Sponsor</a>
</p>

Every chart, component, diagram, and page your AI generates scrolls away into a conversation. Satchel gives them a home: a local-first desktop workspace where artifacts — HTML, SVG, React components, Markdown, images, PDFs — are collected into projects, render live, and stay editable forever, by hand or by AI.

<p align="center">
  <img src="docs/images/grid.png" width="840" alt="A Satchel project of artifacts, each card showing a live thumbnail preview" />
</p>

## Download

Latest installers are on the [releases page](https://github.com/mdschoff/satchel/releases/latest):

- **macOS** — `Satchel_x.y.z_universal.dmg` (Apple Silicon + Intel)
- **Windows** — `Satchel_x.y.z_x64_en-US.msi`

Every release includes a `SHA256SUMS.txt` to verify your download.

> **macOS note:** builds aren't signed with an Apple Developer certificate yet, so Gatekeeper will claim the app is "damaged" and offer to move it to the Trash. It isn't — that's the quarantine flag on an unsigned download. After dragging Satchel to Applications, clear it once:
>
> ```bash
> xattr -cr /Applications/Satchel.app
> ```
>
> Then it opens normally from that point on.

## Why

AI tools generate a lot of one-off, throwaway artifacts. Satchel gives them a permanent, organized home outside any one chat thread — a single window where you can collect, view, edit, and keep working on them.

Open any artifact and it renders live, right next to a code editor and an AI chat — edit it by hand, with your API key, or on your Claude/Codex subscription over MCP:

<p align="center">
  <img src="docs/images/editing.png" width="840" alt="An artifact open in Satchel rendering live, with the Ask AI editing panel open" />
</p>

The MCP loop goes both ways: an agent can create and edit artifacts here — and with the `render_artifact` tool it can *look at* what it made, then fix what it sees.

## Features

**Library**
- Drag-and-drop or file-picker import for HTML, SVG, Markdown, JSX/TSX, images, and PDFs — or just **⌘V paste** content straight from a chat (type is detected, title derived)
- Nested project folders, cross-project search, tags
- Live thumbnails in the grid — each card renders a real scaled preview of its artifact
- Multi-select (⌘-click) and drag artifacts between projects; right-click menus for rename, duplicate, move, export, and delete
- Keyboard shortcuts: ⌘K search, ⌘B sidebar, ⌘N new project, ⌘, settings

**Viewing & editing**
- Artifacts open live and interactive (sandboxed iframe — artifact code can't touch app state)
- **Notes edit like documents** — markdown artifacts are directly editable in place, WYSIWYG, with markdown shortcuts as you type
- Built-in code editor with instant re-render, in a resizable split
- Per-artifact version history with **diffs**: every save snapshots the previous source, restore is itself non-destructive

**AI editing, two ways**
- **Your API key** — an in-app Ask AI panel with pluggable providers (Claude, OpenAI, Gemini, or a local Ollama model). Keys are stored in the OS keychain, never in plain text.
- **Your subscription** — Satchel runs a local [MCP server](docs/mcp-server.md), so any MCP client (Claude Code, Claude Desktop, Cursor) can list, search, create, and edit artifacts directly. Edits appear in the window live, and the `render_artifact` tool lets the agent **see** what it's building.

**Sharing**
- Export any project to a zip and import it into another Satchel with one click — or export a single artifact as a standalone file

## Run from source

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
