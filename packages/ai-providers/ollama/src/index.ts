import { buildEditPrompt } from "@satchel/ai-provider-interface";
import type { AIEditRequest, AIEditResult, AIProvider, AIProviderConfig } from "@satchel/ai-provider-interface";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

export const ollamaProvider: AIProvider = {
  id: "ollama",
  label: "Ollama (local)",
  requiresApiKey: false,
  requiresBaseUrl: true,

  async edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult> {
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model ?? DEFAULT_MODEL,
          prompt: buildEditPrompt(request),
          stream: false,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `Ollama error (${response.status}): ${text}` };
      }
      const data = await response.json();
      if (!data.response) {
        return { ok: false, error: "Ollama returned an empty response." };
      }
      return { ok: true, source: data.response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Couldn't reach Ollama at ${baseUrl} - is it running? (${message})`,
      };
    }
  },
};

export default ollamaProvider;
