import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useLibraryStore } from "../state/library";
import { backend } from "../lib/tauri";
import { getRenderer } from "../renderers/registry";
import { ChatDrawer } from "./ChatDrawer";
import { VersionHistory } from "./VersionHistory";

const EDITABLE_TYPES = new Set(["html", "svg", "markdown", "jsx", "tsx"]);
const MONACO_LANGUAGE: Record<string, string> = {
  html: "html",
  svg: "xml",
  markdown: "markdown",
  jsx: "javascript",
  tsx: "typescript",
};

export function ArtifactView() {
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const selectedArtifactId = useLibraryStore((s) => s.selectedArtifactId);
  const selectArtifact = useLibraryStore((s) => s.selectArtifact);
  const deleteArtifact = useLibraryStore((s) => s.deleteArtifact);
  const artifact = useLibraryStore((s) => s.artifacts.find((a) => a.id === s.selectedArtifactId));

  const [source, setSource] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderSource = useCallback(
    async (rawSource: string) => {
      if (!artifact) return;
      setCompileError(null);
      try {
        const renderer = getRenderer(artifact.type);
        if (!renderer) {
          setCompileError(`No renderer registered for artifact type "${artifact.type}".`);
          return;
        }
        if (renderer.needsCompile && renderer.compile) {
          const compiled = await renderer.compile(rawSource);
          if (!compiled.ok || !compiled.output) {
            setCompileError(compiled.errors?.join("\n") ?? "Compile failed");
            return;
          }
          const result = await renderer.render(compiled.output);
          setPreviewHtml(result.html);
        } else {
          const result = await renderer.render(rawSource);
          setPreviewHtml(result.html);
        }
      } catch (err) {
        setCompileError(`Render failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [artifact],
  );

  const loadSource = useCallback(() => {
    if (!selectedArtifactId) return;
    return backend
      .getArtifactSource(selectedProjectId, selectedArtifactId)
      .then((content) => {
        setSource(content);
        renderSource(content);
      })
      .catch((err) => {
        setCompileError(`Couldn't load this artifact: ${String(err)}`);
      });
  }, [selectedProjectId, selectedArtifactId, renderSource]);

  useEffect(() => {
    if (!artifact || !selectedArtifactId) return;
    loadSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtifactId]);

  function handleEditorChange(value: string | undefined) {
    const next = value ?? "";
    setSource(next);
    renderSource(next);

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (selectedArtifactId) {
        backend.saveArtifactSource(selectedProjectId, selectedArtifactId, next);
      }
    }, 500);
  }

  async function handleAIEdit(newSource: string) {
    setSource(newSource);
    await renderSource(newSource);
    if (selectedArtifactId) {
      await backend.saveArtifactSource(selectedProjectId, selectedArtifactId, newSource);
    }
  }

  if (!artifact) return null;
  const canEdit = EDITABLE_TYPES.has(artifact.type);

  return (
    <div className="artifact-view">
      <header className="artifact-view-header">
        <button className="back-button" onClick={() => selectArtifact(null)}>
          ← Back
        </button>
        <h1>{artifact.title}</h1>
        <div className="artifact-view-actions">
          {canEdit && (
            <button onClick={() => setIsEditorOpen((v) => !v)}>
              {isEditorOpen ? "Hide code" : "Show code"}
            </button>
          )}
          <button onClick={() => setIsHistoryOpen((v) => !v)}>
            {isHistoryOpen ? "Close history" : "History"}
          </button>
          <button onClick={() => setIsChatOpen((v) => !v)}>{isChatOpen ? "Close chat" : "Ask AI"}</button>
          <button
            className="delete-button"
            onClick={() => {
              if (window.confirm(`Delete "${artifact.title}"? This can't be undone.`)) {
                deleteArtifact(artifact.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="artifact-view-body">
        {isEditorOpen && canEdit && (
          <div className="artifact-editor-pane">
            <Editor
              language={MONACO_LANGUAGE[artifact.type] ?? "plaintext"}
              value={source}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        )}

        <div className="artifact-preview-pane">
          {compileError ? (
            <pre className="compile-error">{compileError}</pre>
          ) : (
            <iframe
              className="artifact-preview-frame"
              sandbox="allow-scripts"
              srcDoc={previewHtml}
              title={artifact.title}
            />
          )}
        </div>

        {isHistoryOpen && (
          <VersionHistory
            projectId={selectedProjectId}
            artifactId={artifact.id}
            onRestored={loadSource}
            onClose={() => setIsHistoryOpen(false)}
          />
        )}

        {isChatOpen && (
          <ChatDrawer artifact={artifact} source={source} onApplyEdit={handleAIEdit} />
        )}
      </div>
    </div>
  );
}
