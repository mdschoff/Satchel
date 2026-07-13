import { useEffect, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from "../state/library";
import { backend } from "../lib/tauri";
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

interface CardMenu {
  artifactId: string;
  title: string;
  x: number;
  y: number;
}

export function ProjectGrid() {
  const artifacts = useLibraryStore((s) => s.artifacts);
  const selectArtifact = useLibraryStore((s) => s.selectArtifact);
  const importPaths = useLibraryStore((s) => s.importPaths);
  const moveArtifact = useLibraryStore((s) => s.moveArtifact);
  const deleteArtifact = useLibraryStore((s) => s.deleteArtifact);
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const project = projects.find((p) => p.id === selectedProjectId);
  const otherProjects = projects
    .filter((p) => p.id !== selectedProjectId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const [menu, setMenu] = useState<CardMenu | null>(null);

  // Close the context menu on Escape or any scroll.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  function openMenu(e: React.MouseEvent, artifactId: string, title: string) {
    e.preventDefault();
    // Keep the menu on-screen near the right/bottom edges.
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenu({ artifactId, title, x: Math.max(8, x), y: Math.max(8, y) });
  }

  async function handleImportClick() {
    const selected = await open({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
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
    <div className="project-grid-view">
      <header className="project-grid-header">
        <h1>{project?.name ?? "Project"}</h1>
        <div className="project-grid-header-actions">
          <button onClick={handleExportClick}>Export…</button>
          <button className="btn-primary" onClick={handleImportClick}>
            Import files…
          </button>
        </div>
      </header>

      {artifacts.length === 0 ? (
        <div className="empty-state">
          Drag files anywhere in this window, or use Import files… to add artifacts here.
        </div>
      ) : (
        <div className="artifact-grid">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="artifact-card"
              onContextMenu={(e) => openMenu(e, artifact.id, artifact.title)}
            >
              <button className="artifact-card-open" onClick={() => selectArtifact(artifact.id)}>
                <ArtifactThumbnail artifact={artifact} projectId={selectedProjectId} />
                <span className="artifact-card-meta">
                  <span className={`artifact-card-type type-${artifact.type}`}>
                    {TYPE_LABEL[artifact.type] ?? artifact.type}
                  </span>
                  <span className="artifact-card-title">{artifact.title}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <>
          <div className="context-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
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
          </div>
        </>
      )}
    </div>
  );
}
