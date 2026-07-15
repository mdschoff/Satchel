import { useEffect, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from "../state/library";
import { useUiStore } from "../state/ui";
import { useDndStore } from "../state/dnd";
import { backend } from "../lib/tauri";
import { sniffContent } from "../lib/sniffContent";
import { ArtifactThumbnail } from "./ArtifactThumbnail";

const TYPE_LABEL: Record<string, string> = {
  html: "HTML",
  svg: "SVG",
  markdown: "MD",
  jsx: "JSX",
  tsx: "TSX",
  image: "IMG",
  pdf: "PDF",
};

const MENU_WIDTH = 200;
const DRAG_THRESHOLD = 5;

type Menu =
  | { kind: "card"; artifactId: string; title: string; x: number; y: number }
  | { kind: "background"; x: number; y: number };

export function ProjectGrid() {
  const artifacts = useLibraryStore((s) => s.artifacts);
  const selectArtifact = useLibraryStore((s) => s.selectArtifact);
  const importPaths = useLibraryStore((s) => s.importPaths);
  const moveArtifact = useLibraryStore((s) => s.moveArtifact);
  const moveArtifacts = useLibraryStore((s) => s.moveArtifacts);
  const renameArtifact = useLibraryStore((s) => s.renameArtifact);
  const duplicateArtifact = useLibraryStore((s) => s.duplicateArtifact);
  const createNote = useLibraryStore((s) => s.createNote);
  const deleteArtifact = useLibraryStore((s) => s.deleteArtifact);
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const project = projects.find((p) => p.id === selectedProjectId);
  const otherProjects = projects
    .filter((p) => p.id !== selectedProjectId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const requestNewProject = useUiStore((s) => s.requestNewProject);
  const setDndDragging = useDndStore((s) => s.setDragging);
  const setDndOver = useDndStore((s) => s.setOver);
  const resetDnd = useDndStore((s) => s.reset);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ghost, setGhost] = useState<{ count: number; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const didDragRef = useRef(false);

  // Selection is scoped to the open project; drop it when switching projects.
  useEffect(() => {
    setSelected(new Set());
  }, [selectedProjectId]);

  // ⌘V anywhere on the grid turns clipboard text into a new artifact -
  // the fastest path from "AI chat output" to "in the library". Skipped when
  // the paste is aimed at a real text field (search box, rename input).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      const { artifactType, title } = sniffContent(text);
      useLibraryStore.getState().createFromContent(title, artifactType, text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // Close the context menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Pointer-based drag: start on mousedown, follow the cursor with a stacked
  // ghost, and drop onto whichever sidebar project is under the cursor.
  function onCardMouseDown(e: React.MouseEvent, artifactId: string) {
    if (e.button !== 0) return; // left button only; right-click opens the menu
    didDragRef.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const sel = selectedRef.current;
    const ids = sel.has(artifactId) && sel.size > 0 ? [...sel] : [artifactId];
    let dragging = false;

    const move = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        didDragRef.current = true;
        setDndDragging(ids);
        document.body.classList.add("dnd-active");
      }
      setGhost({ count: ids.length, x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const target = el?.closest("[data-project-id]") as HTMLElement | null;
      setDndOver(target?.getAttribute("data-project-id") ?? null);
    };

    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("dnd-active");
      if (dragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const target = el?.closest("[data-project-id]") as HTMLElement | null;
        const toId = target?.getAttribute("data-project-id");
        if (toId && toId !== selectedProjectId) {
          moveArtifacts(ids, selectedProjectId, toId);
          setSelected(new Set());
        }
      }
      setGhost(null);
      resetDnd();
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function onCardClick(e: React.MouseEvent, artifactId: string) {
    if (didDragRef.current) {
      didDragRef.current = false;
      return; // this "click" was the tail of a drag
    }
    if (e.metaKey || e.ctrlKey) {
      toggleSelect(artifactId);
      return;
    }
    setSelected(new Set());
    selectArtifact(artifactId);
  }

  function menuPos(e: React.MouseEvent) {
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }

  function openCardMenu(e: React.MouseEvent, artifactId: string, title: string) {
    e.preventDefault();
    e.stopPropagation(); // don't also trigger the background menu
    setMenu({ kind: "card", artifactId, title, ...menuPos(e) });
  }

  function openBackgroundMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ kind: "background", ...menuPos(e) });
  }

  function selectAll() {
    setSelected(new Set(artifacts.map((a) => a.id)));
    setMenu(null);
  }

  function startRename(artifactId: string, currentTitle: string) {
    setMenu(null);
    setRenamingId(artifactId);
    setRenameValue(currentTitle);
  }

  function commitRename() {
    if (renamingId) renameArtifact(renamingId, renameValue);
    setRenamingId(null);
  }

  async function handleImportClick() {
    const selectedPaths = await open({ multiple: true });
    if (!selectedPaths) return;
    const paths = Array.isArray(selectedPaths) ? selectedPaths : [selectedPaths];
    await importPaths(paths);
  }

  async function handleExportClick() {
    if (!project) return;
    const destPath = await save({
      title: "Export project",
      defaultPath: `${project.name}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (!destPath) return;
    await backend.exportProject(project.id, destPath);
  }

  async function handleExportArtifact(artifactId: string) {
    setMenu(null);
    const defaultPath = await backend.artifactExportName(selectedProjectId, artifactId);
    const dest = await save({ title: "Export artifact", defaultPath });
    if (dest) await backend.exportArtifact(selectedProjectId, artifactId, dest);
  }

  async function handleDelete(artifactId: string, title: string) {
    setMenu(null);
    const ok = await confirm(`Delete "${title}"? This can't be undone.`, {
      title: "Delete artifact",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) deleteArtifact(artifactId);
  }

  return (
    <div className="project-grid-view" onContextMenu={openBackgroundMenu}>
      <header className="project-grid-header">
        <h1>{project?.name ?? "Project"}</h1>
        <div className="project-grid-header-actions">
          {selected.size > 0 && (
            <span className="selection-count">{selected.size} selected</span>
          )}
          <button onClick={() => createNote()}>New note</button>
          <button onClick={handleExportClick}>Export…</button>
          <button className="btn-primary" onClick={handleImportClick}>
            Import files…
          </button>
        </div>
      </header>

      {artifacts.length === 0 ? (
        <div className="empty-state">
          Drag files anywhere in this window, paste (⌘V) something an AI just made, or use Import
          files… to add artifacts here.
        </div>
      ) : (
        <div className="artifact-grid">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className={`artifact-card ${selected.has(artifact.id) ? "selected" : ""}`}
              onMouseDown={(e) => onCardMouseDown(e, artifact.id)}
              onClick={(e) => onCardClick(e, artifact.id)}
              onContextMenu={(e) => openCardMenu(e, artifact.id, artifact.title)}
            >
              <div className="artifact-card-open">
                <ArtifactThumbnail artifact={artifact} projectId={selectedProjectId} />
                <span className="artifact-card-meta">
                  <span className={`artifact-card-type type-${artifact.type}`}>
                    {TYPE_LABEL[artifact.type] ?? artifact.type}
                  </span>
                  {renamingId === artifact.id ? (
                    <input
                      className="artifact-rename-input"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.currentTarget.value)}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        else if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="artifact-card-title">{artifact.title}</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 10 }}>
          {ghost.count > 1 && <div className="drag-ghost-card third" />}
          {ghost.count > 1 && <div className="drag-ghost-card second" />}
          <div className="drag-ghost-card" />
          <div className="drag-ghost-badge">{ghost.count}</div>
        </div>
      )}

      {menu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
            {menu.kind === "card" ? (
              <>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => startRename(menu.artifactId, menu.title)}
                >
                  Rename
                </button>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    duplicateArtifact(menu.artifactId);
                    setMenu(null);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => handleExportArtifact(menu.artifactId)}
                >
                  Export…
                </button>
                <div className="context-menu-sep" />
                <div className="context-menu-label">Move to</div>
                {otherProjects.length === 0 ? (
                  <div className="context-menu-empty">No other projects</div>
                ) : (
                  otherProjects.map((p) => (
                    <button
                      key={p.id}
                      className="context-menu-item"
                      role="menuitem"
                      onClick={() => {
                        moveArtifact(menu.artifactId, selectedProjectId, p.id);
                        setMenu(null);
                      }}
                    >
                      {p.name}
                    </button>
                  ))
                )}
                <div className="context-menu-sep" />
                <button
                  className="context-menu-item danger"
                  role="menuitem"
                  onClick={() => handleDelete(menu.artifactId, menu.title)}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    handleImportClick();
                  }}
                >
                  Import files…
                </button>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    requestNewProject();
                  }}
                >
                  New project…
                </button>
                {artifacts.length > 0 && (
                  <button className="context-menu-item" role="menuitem" onClick={selectAll}>
                    Select all
                  </button>
                )}
                <div className="context-menu-sep" />
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    handleExportClick();
                  }}
                >
                  Export project…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
