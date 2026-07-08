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

  function renderProjectItem(id: string, name: string) {
    return (
      <li
        key={id}
        className={`project-item ${selectedProjectId === id ? "active" : ""}`}
        onClick={() => selectProject(id)}
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
