import { buildEditPrompt } from "@satchel/ai-provider-interface";
import type { AIEditRequest, AIEditResult, AIProvider, AIProviderConfig } from "@satchel/ai-provider-interface";

const DEFAULT_MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export const claudeProvider: AIProvider = {
  id: "claude",
  label: "Claude (Anthropic)",
  requiresApiKey: true,

  async edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult> {
    if (!config.apiKey) {
      return { ok: false, error: "Missing Anthropic API key. Add one in Settings." };
    }
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: config.model ?? DEFAULT_MODEL,
          max_tokens: 8192,
          messages: [{ role: "user", content: buildEditPrompt(request) }],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `Claude API error (${response.status}): ${text}` };
      }
      const data = await response.json();
      const text = data.content?.[0]?.text;
      if (!text) {
        return { ok: false, error: "Claude returned an empty response." };
      }
      return { ok: true, source: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export default claudeProvider;
