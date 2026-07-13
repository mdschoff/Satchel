import { useEffect, useState } from "react";
import { aiProviders } from "../ai/registry";
import { useApiKeyStore } from "../state/apiKeys";
import { useSettingsStore } from "../state/settings";
import { useUiStore } from "../state/ui";

// Must match MCP_PORT in apps/desktop/src-tauri/src/mcp.rs.
const MCP_URL = "http://127.0.0.1:7825/mcp";
const CLAUDE_CODE_CMD = `claude mcp add --transport http satchel ${MCP_URL}`;
const MCP_JSON = `{
  "mcpServers": {
    "satchel": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`;

export function Settings() {
  const setView = useUiStore((s) => s.setView);
  const providerSettings = useSettingsStore((s) => s.providers);
  const updateProviderSettings = useSettingsStore((s) => s.updateProviderSettings);
  const keys = useApiKeyStore((s) => s.keys);
  const loadKey = useApiKeyStore((s) => s.loadKey);
  const setKey = useApiKeyStore((s) => s.setKey);

  const [selectedId, setSelectedId] = useState(aiProviders[0]?.id ?? "");
  const provider = aiProviders.find((p) => p.id === selectedId) ?? aiProviders[0];
  const settings = provider ? providerSettings[provider.id] ?? {} : {};

  useEffect(() => {
    for (const p of aiProviders) {
      if (p.requiresApiKey) {
        loadKey(p.id);
      }
    }
  }, [loadKey]);

  return (
    <div className="settings-view">
      <header className="settings-header">
        <button className="back-button" onClick={() => setView("library")}>
          ← Back
        </button>
        <h1>Settings</h1>
      </header>

      <div className="settings-body">
        <h2>AI providers</h2>
        <p className="settings-hint">
          API keys are stored in your OS keychain, never in plain text. Leave blank for providers
          you don't use.
        </p>

        {provider && (
          <div className="settings-provider-card">
            <div className="settings-field-grid">
              <label>
                Provider
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.currentTarget.value)}
                >
                  {aiProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {provider.requiresApiKey && (
                <label>
                  API key
                  <input
                    type="password"
                    value={keys[provider.id] ?? ""}
                    onChange={(e) => setKey(provider.id, e.currentTarget.value)}
                    placeholder="sk-…"
                  />
                </label>
              )}
              <label>
                Model
                <input
                  type="text"
                  value={settings.model ?? ""}
                  onChange={(e) =>
                    updateProviderSettings(provider.id, { model: e.currentTarget.value })
                  }
                  placeholder="default"
                />
              </label>
              {provider.requiresBaseUrl && (
                <label>
                  Base URL
                  <input
                    type="text"
                    value={settings.baseUrl ?? ""}
                    onChange={(e) =>
                      updateProviderSettings(provider.id, { baseUrl: e.currentTarget.value })
                    }
                    placeholder="http://localhost:11434"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        <h2>Edit with your subscription (MCP)</h2>
        <p className="settings-hint">
          Prefer your existing Claude or Codex subscription over an API key? Point an MCP client
          (Claude Code, Claude Desktop, Cursor) at Satchel's local server, then just ask it to edit
          an artifact by name - changes appear live in this window, with each edit saved to history.
        </p>
        <div className="settings-provider-card">
          <div className="settings-field-grid">
            <label>
              Endpoint (localhost only)
              <code className="settings-mcp-url">{MCP_URL}</code>
            </label>
            <label>
              Claude Code — one command
              <code className="settings-mcp-block">{CLAUDE_CODE_CMD}</code>
            </label>
            <label>
              Claude Desktop / Cursor — add to mcpServers
              <pre className="settings-mcp-block">{MCP_JSON}</pre>
            </label>
          </div>
          <p className="settings-hint settings-mcp-example">
            Then in your client: <em>“In Satchel, open the counter artifact in Test and add a reset
            button.”</em>
          </p>
        </div>
      </div>
    </div>
  );
}
