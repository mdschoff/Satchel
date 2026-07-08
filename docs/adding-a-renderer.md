# Adding an artifact renderer

1. Add the type to `ArtifactType` in `packages/artifact-core/src/types.ts`.
2. Add its extension(s) to `EXTENSION_MAP` in `packages/artifact-core/src/detect.ts` (and the matching Rust-side map in `apps/desktop/src-tauri/src/library/mod.rs`, `EXTENSION_TYPE_MAP`).
3. Create `packages/renderers/<name>` with a `package.json` (see an existing renderer for the shape), depending on `@satchel/artifact-core`.
4. Implement `ArtifactRenderer` from `@satchel/artifact-core`:
   ```ts
   export const myRenderer: ArtifactRenderer = {
     type: "mytype",
     needsCompile: false, // true if source needs a build step before it can render
     async render(source) {
       return { html: `...` }; // a full HTML document string for the sandboxed iframe
     },
   };
   ```
5. Add the package as a dependency of `apps/desktop` and register it in `apps/desktop/src/renderers/registry.ts`.

Binary formats (images, PDFs) receive a `data:` URL as their "source" string rather than raw text - the caller reads the file and encodes it before calling `render()`, so every renderer's signature stays uniform.
