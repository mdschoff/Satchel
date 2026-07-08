# Adding an AI edit provider

1. Create `packages/ai-providers/<name>` with a `package.json` depending on `@satchel/ai-provider-interface`.
2. Implement `AIProvider`:
   ```ts
   export const myProvider: AIProvider = {
     id: "myprovider",
     label: "My Provider",
     requiresApiKey: true, // false for local/offline providers
     async edit(request, config) {
       // request: { source, instruction, context: { artifactType, fileName } }
       // config: { apiKey?, baseUrl?, model? } - whatever the user set in Settings
       // return { ok: true, source: newSource } or { ok: false, error: "..." }
     },
   };
   ```
   `buildEditPrompt(request)` from `@satchel/ai-provider-interface` gives a ready-made prompt if the provider just needs a single text completion.
3. Add the package as a dependency of `apps/desktop` and register it in `apps/desktop/src/ai/registry.ts`.

Cloud providers should read the API key from `config.apiKey` rather than hardcoding one. Local providers (like Ollama) should default `requiresApiKey` to `false` and use `config.baseUrl` for the local server address.
