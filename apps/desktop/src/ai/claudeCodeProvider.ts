import { invoke } from "@tauri-apps/api/core";
import { buildEditPrompt } from "@satchel/ai-provider-interface";
import type {
  AIEditRequest,
  AIEditResult,
  AIProvider,
  AIProviderConfig,
} from "@satchel/ai-provider-interface";

/**
 * In-app editing on the user's Claude subscription (no API key). Unlike the
 * other providers, this one can't call an HTTP API from the sandboxed webview -
 * it delegates to a Rust command that shells out to the locally-installed
 * Claude Code CLI in headless mode, which runs on whatever `claude` is signed
 * into. Lives in the app (not a shared package) because it depends on Tauri.
 */

/** Models sometimes wrap output in a code fence despite being asked not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}

export const claudeCodeProvider: AIProvider = {
  id: "claude-code",
  label: "Claude Code (subscription)",
  requiresApiKey: false,

  async edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult> {
    try {
      const raw = await invoke<string>("ai_edit_via_claude_code", {
        prompt: buildEditPrompt(request),
        model: config.model?.trim() ? config.model : null,
      });
      const source = stripCodeFence(raw);
      if (!source) return { ok: false, error: "Claude Code returned an empty response." };
      return { ok: true, source };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export default claudeCodeProvider;
