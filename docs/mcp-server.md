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
- `render_artifact` - render an artifact to a PNG so the model can *see* what it looks like (SVG today) - the feedback loop for iterating on visuals
- `create_artifact` - push a new artifact in directly from content (html, svg, markdown, jsx, tsx)
- `update_artifact` - overwrite an existing artifact's content (the previous version is kept in that artifact's history)
- `list_artifact_versions` - see an artifact's saved version history

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
