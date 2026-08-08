# MCP server

Satchel runs a local MCP server (Streamable HTTP, bound to `127.0.0.1` only)
whenever the app is running, at:

```
http://127.0.0.1:7825/mcp
```

This lets any MCP-aware tool - Claude Code, Claude Desktop, Cursor, etc. -
list, search, create, and update artifacts directly from a conversation,
instead of you copying content in and out by hand.

## Tools exposed

- `list_projects` - every project (folder), including nested ones via `parentId`
- `create_project` - create a project, optionally nested under another
- `list_artifacts` - artifacts within a project
- `search_artifacts` - search by title/tags across every project
- `get_artifact_source` - read an artifact's content
- `render_artifact` - render an artifact to a PNG so the model can *see* what it looks like (SVG today) - the feedback loop for iterating on visuals. Also returns [render diagnostics](#render-diagnostics)
- `create_artifact` - push a new artifact in directly from content (html, svg, markdown, jsx, tsx)
- `update_artifact` - overwrite an existing artifact's content (the previous version is kept in that artifact's history)
- `list_artifact_versions` - see an artifact's saved version history

## Render diagnostics

`render_artifact` returns two blocks: the PNG, and a short text report about
the render itself.

The report exists because rasterization fails *silently* in ways that look
exactly like a markup bug in the resulting pixels:

- **Blank references.** resvg performs no network or filesystem fetches, so an
  `<image href="https://...">` (or a relative path) renders as empty space
  rather than erroring.
- **Substituted fonts.** A `font-family` that isn't installed on the machine
  falls back to another face, so text comes out the wrong shape or width.

Without that context, a model looking only at pixels will confidently rewrite
perfectly good markup trying to fix a gap that no edit can close. With it, it
can tell "this is a real visual bug" apart from "this asset was never going to
load here."

A clean render says so explicitly:

```
Rendered 1024x768px. No asset or font problems detected: what you see is what
the source says.
```

A problematic one names the cause:

```
Rendered 1024x768px.

MISSING FONTS (1): Inter
Text using these was drawn with a substitute face. If the text looks wrong,
that's this - not your markup. Embed the font or use one that's installed.

BLANK REFERENCES (1):
  - https://example.com/logo.png (remote URL; resvg performs no network requests)
These rendered as empty space. Inline the asset as a data: URI to make it
appear. Do NOT rewrite surrounding markup to chase the gap.
```

## Connecting a client

### Claude Code

Add to `.mcp.json` in your project (or `~/.claude.json` for a user-wide config):

```json
{
  "mcpServers": {
    "satchel": {
      "type": "http",
      "url": "http://127.0.0.1:7825/mcp"
    }
  }
}
```

### Claude Desktop / Cursor / other MCP clients

Most MCP clients that support Streamable HTTP servers accept the same shape -
a name and a URL. Check your client's MCP settings for where to add a
custom server, and point it at `http://127.0.0.1:7825/mcp`.

## Notes

- The server only binds to localhost - nothing on your network can reach it.
- Binary artifact types (image, pdf) aren't creatable via `create_artifact`;
  those always arrive through drag-and-drop/Finder import instead.
- The port is fixed at `7825` for now (see `MCP_PORT` in
  `apps/desktop/src-tauri/src/mcp.rs`) - not yet configurable from Settings.
