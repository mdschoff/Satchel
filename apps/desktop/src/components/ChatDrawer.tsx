import { useEffect, useState } from "react";
import type { ArtifactManifest } from "@satchel/artifact-core";
import { aiProviders, getProvider } from "../ai/registry";
import { useSettingsStore } from "../state/settings";
import { useApiKeyStore } from "../state/apiKeys";

interface ChatDrawerProps {
  artifact: ArtifactManifest;
  source: string;
  onApplyEdit: (newSource: string) => void;
}

export function ChatDrawer({ artifact, source, onApplyEdit }: ChatDrawerProps) {
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider);
  // Select the stable providers map and derive the per-provider settings here.
  // Returning `... ?? {}` straight from the selector hands zustand a new object
  // reference every render, which it reads as a state change → infinite loop.
  const providers = useSettingsStore((s) => s.providers);
  const providerSettings = providers[activeProviderId] ?? {};

  const apiKey = useApiKeyStore((s) => s.keys[activeProviderId] ?? "");
  const loadKey = useApiKeyStore((s) => s.loadKey);
  const setKey = useApiKeyStore((s) => s.setKey);

  const [instruction, setInstruction] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = getProvider(activeProviderId);

  useEffect(() => {
    if (provider?.requiresApiKey) {
      loadKey(activeProviderId);
    }
  }, [activeProviderId, provider?.requiresApiKey, loadKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider || !instruction.trim()) return;
    setIsRunning(true);
    setError(null);
    const result = await provider.edit(
      { source, instruction, context: { artifactType: artifact.type, fileName: artifact.sourceFile } },
      { ...providerSettings, apiKey },
    );
    setIsRunning(false);
    if (result.ok && result.source) {
      onApplyEdit(result.source);
      setInstruction("");
    } else {
      setError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div className="chat-drawer">
      <div className="chat-drawer-provider">
        <select value={activeProviderId} onChange={(e) => setActiveProvider(e.target.value)}>
          {aiProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {provider?.requiresApiKey && (
          <input
            type="password"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setKey(activeProviderId, e.currentTarget.value)}
          />
        )}
      </div>

      <form className="chat-drawer-form" onSubmit={handleSubmit}>
        <textarea
          placeholder={`Tell ${provider?.label ?? "the AI"} how to change this artifact…`}
          value={instruction}
          onChange={(e) => setInstruction(e.currentTarget.value)}
          rows={4}
        />
        <button type="submit" disabled={isRunning || !instruction.trim()}>
          {isRunning ? "Working…" : "Apply"}
        </button>
      </form>

      {error && <div className="chat-drawer-error">{error}</div>}

      <p className="chat-drawer-mcp-note">
        On your subscription (no API key): pick <strong>Claude Code (subscription)</strong> above, or
        drive edits from any MCP client (Settings → MCP). Changes show up here live either way.
      </p>
    </div>
  );
}
