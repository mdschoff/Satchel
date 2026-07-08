import { useState } from "react";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { useLibraryStore } from "../state/library";

export function Sidebar() {
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const selectProject = useLibraryStore((s) => s.selectProject);
  const createProject = useLibraryStore((s) => s.createProject);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

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

  return (
    <nav className="sidebar">
      <div className="sidebar-header">Satchel</div>
      <ul className="project-list">
        {inbox && (
          <li
            className={`project-item ${selectedProjectId === inbox.id ? "active" : ""}`}
            onClick={() => selectProject(inbox.id)}
          >
            {inbox.name}
          </li>
        )}
        {others.map((project) => (
          <li
            key={project.id}
            className={`project-item ${selectedProjectId === project.id ? "active" : ""}`}
            onClick={() => selectProject(project.id)}
          >
            {project.name}
          </li>
        ))}
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
