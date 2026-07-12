# Satchel

A local-first desktop workspace for artifacts your AI makes - HTML, SVG, React components, Markdown, images, PDFs. Drag them in, organize them into projects, open them live and interactive, and edit them by hand or by asking an AI (your own API key, or a local model) to tailor them.

## Why

AI tools generate a lot of one-off, throwaway artifacts. Satchel gives them a permanent, organized home outside any one chat thread - a single window where you can collect, view, edit, and keep working on them.

## Status

Core pieces in place: drag-and-drop/Finder import, nested project folders, cross-project search, live rendering for HTML/SVG/JSX-TSX/Markdown/images/PDF, a code editor with live re-render, per-artifact version history, project export to zip, artifact deletion, and pluggable AI-edit providers (Claude, OpenAI, Gemini, or a local Ollama model) with a Settings screen for API keys - stored in the OS keychain, never in plain text.

Satchel also runs a local [MCP server](docs/mcp-server.md) so MCP-aware tools (Claude Code, Claude Desktop, Cursor) can list, search, and push artifacts in directly from a conversation.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full picture. In short:

- **`apps/desktop`** - the Tauri 2 app (Rust backend + React/TypeScript frontend)
- **`packages/artifact-core`** - shared types, manifest schema, and type-detection logic
- **`packages/renderers/*`** - one package per artifact type, each implementing a shared render interface
- **`packages/ai-providers/*`** - one package per AI provider, each implementing a shared edit interface

New artifact types and new AI providers are added as new packages, not by modifying core logic.

## Storage model

Everything lives in plain files on disk under the app's data directory:

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
└── index.sqlite   (rebuildable metadata cache - not the source of truth)
```

## Getting started

Requires [pnpm](https://pnpm.io) and the [Rust toolchain](https://rustup.rs).

```bash
pnpm install
pnpm dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and the plugin-authoring guides for adding a new [artifact renderer](docs/adding-a-renderer.md) or [AI provider](docs/adding-an-ai-provider.md).

## License

MIT
