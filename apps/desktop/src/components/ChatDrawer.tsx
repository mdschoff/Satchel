import { useState } from "react";
import type { ArtifactManifest } from "@satchel/artifact-core";
import { aiProviders, getProvider } from "../ai/registry";
import { useSettingsStore } from "../state/settings";

interface ChatDrawerProps {
  artifact: ArtifactManifest;
  source: string;
  onApplyEdit: (newSource: string) => void;
}

export function ChatDrawer({ artifact, source, onApplyEdit }: ChatDrawerProps) {
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider);
  const providerSettings = useSettingsStore((s) => s.providers[activeProviderId] ?? {});
  const updateProviderSettings = useSettingsStore((s) => s.updateProviderSettings);

  const [instruction, setInstruction] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = getProvider(activeProviderId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider || !instruction.trim()) return;
    setIsRunning(true);
    setError(null);
    const result = await provider.edit(
      { source, instruction, context: { artifactType: artifact.type, fileName: artifact.sourceFile } },
      providerSettings,
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
            value={providerSettings.apiKey ?? ""}
            onChange={(e) => updateProviderSettings(activeProviderId, { apiKey: e.currentTarget.value })}
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
    </div>
  );
}
