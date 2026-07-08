import { buildEditPrompt } from "@satchel/ai-provider-interface";
import type { AIEditRequest, AIEditResult, AIProvider, AIProviderConfig } from "@satchel/ai-provider-interface";

const DEFAULT_MODEL = "gemini-2.0-flash";

export const geminiProvider: AIProvider = {
  id: "gemini",
  label: "Gemini (Google)",
  requiresApiKey: true,

  async edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult> {
    if (!config.apiKey) {
      return { ok: false, error: "Missing Gemini API key. Add one in Settings." };
    }
    const model = config.model ?? DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildEditPrompt(request) }] }],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `Gemini API error (${response.status}): ${text}` };
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { ok: false, error: "Gemini returned an empty response." };
      }
      return { ok: true, source: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export default geminiProvider;
