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
  const moveArtifact = useLibraryStore((s) => s.moveArtifact);
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const project = projects.find((p) => p.id === selectedProjectId);
  const otherProjects = projects
    .filter((p) => p.id !== selectedProjectId)
    .sort((a, b) => a.name.localeCompare(b.name));

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
            <div key={artifact.id} className="artifact-card">
              <button className="artifact-card-open" onClick={() => selectArtifact(artifact.id)}>
                <span className="artifact-card-type">{TYPE_LABEL[artifact.type] ?? artifact.type}</span>
                <span className="artifact-card-title">{artifact.title}</span>
              </button>
              {otherProjects.length > 0 && (
                <select
                  className="artifact-card-move"
                  value=""
                  onChange={(e) => {
                    const targetId = e.target.value;
                    if (targetId) moveArtifact(artifact.id, selectedProjectId, targetId);
                  }}
                >
                  <option value="" disabled>
                    Move to…
                  </option>
                  {otherProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
