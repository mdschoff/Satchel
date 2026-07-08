/**
 * Common contract every AI edit provider (packages/ai-providers/*) implements.
 * Adding a new provider (another cloud API, another local runtime) means
 * creating a new package satisfying this interface and registering it in the
 * frontend's provider registry - the artifact/chat UI never branches on which
 * provider is active.
 */

export interface AIEditContext {
  artifactType: string;
  fileName: string;
}

export interface AIEditRequest {
  source: string;
  instruction: string;
  context: AIEditContext;
}

export interface AIEditResult {
  ok: boolean;
  source?: string;
  error?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AIProvider {
  id: string;
  label: string;
  requiresApiKey: boolean;
  edit(request: AIEditRequest, config: AIProviderConfig): Promise<AIEditResult>;
}

export function buildEditPrompt(request: AIEditRequest): string {
  return `You are editing a ${request.context.artifactType} artifact named "${request.context.fileName}".
Apply this instruction: ${request.instruction}

Return ONLY the full, complete updated source code for the file - no explanation, no markdown code fences.

Current source:
${request.source}`;
}
