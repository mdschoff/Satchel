import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useLibraryStore } from "../state/library";
import { backend } from "../lib/tauri";
import { getRenderer } from "../renderers/registry";
import { ChatDrawer } from "./ChatDrawer";
import { NoteEditor } from "./NoteEditor";
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

  const setArtifactTags = useLibraryStore((s) => s.setArtifactTags);

  const [source, setSource] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resizable split: code pane as % of the body, side drawers in px.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [editorPct, setEditorPct] = useState(45);
  const [historyWidth, setHistoryWidth] = useState(288);
  const [chatWidth, setChatWidth] = useState(336);

  /** Generic divider drag: applies clientX against the body's rect until mouseup. */
  function startResize(e: React.MouseEvent, apply: (clientX: number, rect: DOMRect) => void) {
    e.preventDefault();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    document.body.classList.add("pane-resizing");
    const move = (ev: MouseEvent) => apply(ev.clientX, rect);
    const up = () => {
      document.body.classList.remove("pane-resizing");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
    // Opening an artifact always starts clean: just the document/preview.
    // Code, history, and chat are opt-in per visit.
    setIsEditorOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtifactId]);

  // When an MCP client edits the artifact that's currently open, reload its
  // source live so you can watch the model work through it.
  useEffect(() => {
    if (!selectedArtifactId) return;
    const unlisten = listen<{ artifactId?: string }>("library:changed", (event) => {
      if (event.payload?.artifactId === selectedArtifactId) {
        loadSource();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedArtifactId, loadSource]);

  const isNote = artifact?.type === "markdown";

  // Shared save path for both the code pane and the in-document note editor.
  function updateSource(next: string) {
    setSource(next);
    // Notes render in the document editor itself; no iframe re-render needed.
    if (!isNote) renderSource(next);

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (selectedArtifactId) {
        backend.saveArtifactSource(selectedProjectId, selectedArtifactId, next);
      }
    }, 500);
  }

  function handleEditorChange(value: string | undefined) {
    updateSource(value ?? "");
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

  function commitTag() {
    const tag = tagValue.trim();
    if (tag && artifact) {
      setArtifactTags(artifact.id, [...artifact.tags, tag]);
    }
    setTagValue("");
    setIsAddingTag(false);
  }

  function removeTag(tag: string) {
    if (!artifact) return;
    setArtifactTags(
      artifact.id,
      artifact.tags.filter((t) => t !== tag),
    );
  }

  return (
    <div className="artifact-view">
      <header className="artifact-view-header">
        <button className="back-button" onClick={() => selectArtifact(null)}>
          ← Back
        </button>
        <div className="artifact-view-titlewrap">
          <h1>{artifact.title}</h1>
          <div className="artifact-tags">
            {artifact.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button className="tag-remove" title="Remove tag" onClick={() => removeTag(tag)}>
                  ×
                </button>
              </span>
            ))}
            {isAddingTag ? (
              <input
                className="tag-add-input"
                autoFocus
                value={tagValue}
                placeholder="tag"
                onChange={(e) => setTagValue(e.currentTarget.value)}
                onBlur={commitTag}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTag();
                  else if (e.key === "Escape") {
                    setTagValue("");
                    setIsAddingTag(false);
                  }
                }}
              />
            ) : (
              <button className="tag-add" title="Add tag" onClick={() => setIsAddingTag(true)}>
                + tag
              </button>
            )}
          </div>
        </div>
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
            onClick={async () => {
              const ok = await confirm(`Delete "${artifact.title}"? This can't be undone.`, {
                title: "Delete artifact",
                kind: "warning",
                okLabel: "Delete",
                cancelLabel: "Cancel",
              });
              if (ok) deleteArtifact(artifact.id);
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="artifact-view-body" ref={bodyRef}>
        {isEditorOpen && canEdit && (
          <>
            <div className="artifact-editor-pane" style={{ width: `${editorPct}%` }}>
              <Editor
                language={MONACO_LANGUAGE[artifact.type] ?? "plaintext"}
                value={source}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
            <div
              className="pane-resizer"
              onMouseDown={(e) =>
                startResize(e, (x, rect) =>
                  setEditorPct(clamp(((x - rect.left) / rect.width) * 100, 20, 75)),
                )
              }
            />
          </>
        )}

        <div className="artifact-preview-pane">
          {isNote ? (
            <NoteEditor key={artifact.id} markdown={source} onChange={updateSource} />
          ) : compileError ? (
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
          <>
            <div
              className="pane-resizer"
              onMouseDown={(e) =>
                startResize(e, (x, rect) => setHistoryWidth(clamp(rect.right - x, 220, 560)))
              }
            />
            <div className="drawer-sizer" style={{ width: historyWidth }}>
              <VersionHistory
                projectId={selectedProjectId}
                artifactId={artifact.id}
                onRestored={loadSource}
                onClose={() => setIsHistoryOpen(false)}
              />
            </div>
          </>
        )}

        {isChatOpen && (
          <>
            <div
              className="pane-resizer"
              onMouseDown={(e) =>
                startResize(e, (x, rect) => setChatWidth(clamp(rect.right - x, 240, 560)))
              }
            />
            <div className="drawer-sizer" style={{ width: chatWidth }}>
              <ChatDrawer artifact={artifact} source={source} onApplyEdit={handleAIEdit} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
