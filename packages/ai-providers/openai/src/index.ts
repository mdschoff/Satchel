import { buildEditPrompt } from "@satchel/ai-provider-interface";
import type { AIEditRequest, AIEditResult, AIProvider, AIProviderConfig } from "@satchel/ai-provider-interface";

const DEFAULT_MODEL = "gpt-4o";
const API_URL = "https://api.openai.com/v1/chat/completions";

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI",
  requiresApiKey: true,

  async edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult> {
    if (!config.apiKey) {
      return { ok: false, error: "Missing OpenAI API key. Add one in Settings." };
    }
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model ?? DEFAULT_MODEL,
          messages: [{ role: "user", content: buildEditPrompt(request) }],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `OpenAI API error (${response.status}): ${text}` };
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        return { ok: false, error: "OpenAI returned an empty response." };
      }
      return { ok: true, source: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export default openaiProvider;
