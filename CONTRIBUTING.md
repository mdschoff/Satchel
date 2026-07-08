# Contributing to Satchel

## Setup

```bash
pnpm install
pnpm dev
```

This launches the Tauri app in dev mode with hot reload for the frontend.

## Project layout

- `apps/desktop` - the app itself (`src-tauri` for Rust, `src` for React/TS)
- `packages/artifact-core` - shared types and manifest schema; change here needs a `schemaVersion` bump if it breaks existing on-disk data
- `packages/renderers/*` - one package per artifact type
- `packages/ai-providers/*` - one package per AI edit provider

## Adding features

- New artifact type: see [docs/adding-a-renderer.md](docs/adding-a-renderer.md)
- New AI provider: see [docs/adding-an-ai-provider.md](docs/adding-an-ai-provider.md)
- Changes to the Rust backend live in `apps/desktop/src-tauri/src` - run `cargo check` from that directory before opening a PR

## Pull requests

Keep PRs scoped to one change. Explain the "why" in the description, not just the "what".
