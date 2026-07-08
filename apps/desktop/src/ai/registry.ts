import type { AIProvider } from "@satchel/ai-provider-interface";
import { claudeProvider } from "@satchel/ai-provider-claude";
import { openaiProvider } from "@satchel/ai-provider-openai";
import { geminiProvider } from "@satchel/ai-provider-gemini";
import { ollamaProvider } from "@satchel/ai-provider-ollama";

/** New providers register here; Settings and the chat drawer both read from this list. */
export const aiProviders: AIProvider[] = [claudeProvider, openaiProvider, geminiProvider, ollamaProvider];

export function getProvider(id: string): AIProvider | undefined {
  return aiProviders.find((provider) => provider.id === id);
}
