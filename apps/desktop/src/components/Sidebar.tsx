import { useState } from "react";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { useLibraryStore } from "../state/library";
import { ARTIFACT_DRAG_MIME } from "./ProjectGrid";

export function Sidebar() {
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const selectProject = useLibraryStore((s) => s.selectProject);
  const createProject = useLibraryStore((s) => s.createProject);
  const moveArtifact = useLibraryStore((s) => s.moveArtifact);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const inbox = projects.find((p) => p.id === INBOX_PROJECT_ID);
  const others = projects
    .filter((p) => p.id !== INBOX_PROJECT_ID)
    .sort((a, b) => a.name.localeCompare(b.name));

  async function submitNewProject() {
    const name = newName.trim();
    if (name) {
      await createProject(name);
    }
    setNewName("");
    setIsCreating(false);
  }

  function handleDrop(e: React.DragEvent, targetProjectId: string) {
    e.preventDefault();
    setDropTargetId(null);
    const artifactId = e.dataTransfer.getData(ARTIFACT_DRAG_MIME);
    if (artifactId) {
      moveArtifact(artifactId, selectedProjectId, targetProjectId);
    }
  }

  function renderProjectItem(id: string, name: string) {
    return (
      <li
        key={id}
        className={`project-item ${selectedProjectId === id ? "active" : ""} ${dropTargetId === id ? "drop-target" : ""}`}
        onClick={() => selectProject(id)}
        onDragOver={(e) => {
          e.preventDefault();
          setDropTargetId(id);
        }}
        onDragLeave={() => setDropTargetId((current) => (current === id ? null : current))}
        onDrop={(e) => handleDrop(e, id)}
      >
        {name}
      </li>
    );
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">Satchel</div>
      <ul className="project-list">
        {inbox && renderProjectItem(inbox.id, inbox.name)}
        {others.map((project) => renderProjectItem(project.id, project.name))}
      </ul>

      {isCreating ? (
        <form
          className="new-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitNewProject();
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onBlur={submitNewProject}
            placeholder="Project name"
          />
        </form>
      ) : (
        <button className="new-project-button" onClick={() => setIsCreating(true)}>
          + New Project
        </button>
      )}
    </nav>
  );
}
