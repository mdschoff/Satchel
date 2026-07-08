import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from "../state/library";

const TYPE_LABEL: Record<string, string> = {
  html: "HTML",
  svg: "SVG",
  markdown: "MD",
  jsx: "JSX",
  tsx: "TSX",
  image: "IMG",
  pdf: "PDF",
};

export function ProjectGrid() {
  const artifacts = useLibraryStore((s) => s.artifacts);
  const selectArtifact = useLibraryStore((s) => s.selectArtifact);
  const importPaths = useLibraryStore((s) => s.importPaths);
  const project = useLibraryStore((s) => s.projects.find((p) => p.id === s.selectedProjectId));

  async function handleImportClick() {
    const selected = await open({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await importPaths(paths);
  }

  return (
    <div className="project-grid-view">
      <header className="project-grid-header">
        <h1>{project?.name ?? "Project"}</h1>
        <button onClick={handleImportClick}>Import files…</button>
      </header>

      {artifacts.length === 0 ? (
        <div className="empty-state">
          Drag files anywhere in this window, or use Import files… to add artifacts here.
        </div>
      ) : (
        <div className="artifact-grid">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              className="artifact-card"
              onClick={() => selectArtifact(artifact.id)}
            >
              <span className="artifact-card-type">{TYPE_LABEL[artifact.type] ?? artifact.type}</span>
              <span className="artifact-card-title">{artifact.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
