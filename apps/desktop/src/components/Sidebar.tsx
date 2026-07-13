import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import type { Project } from "@satchel/artifact-core";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { useLibraryStore } from "../state/library";
import { useUiStore } from "../state/ui";

// dev = running against the Vite dev server (latest source, hot-reloaded);
// packaged = a built .app with frozen assets. import.meta.env.DEV tells them apart.
const BUILD_CHANNEL = import.meta.env.DEV ? "dev" : "packaged";

const TYPE_LABEL: Record<string, string> = {
  html: "HTML",
  svg: "SVG",
  markdown: "MD",
  jsx: "JSX",
  tsx: "TSX",
  image: "IMG",
  pdf: "PDF",
};

export function Sidebar() {
  const projects = useLibraryStore((s) => s.projects);
  const selectedProjectId = useLibraryStore((s) => s.selectedProjectId);
  const selectProject = useLibraryStore((s) => s.selectProject);
  const createProject = useLibraryStore((s) => s.createProject);
  const importProject = useLibraryStore((s) => s.importProject);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const searchResults = useLibraryStore((s) => s.searchResults);
  const search = useLibraryStore((s) => s.search);
  const clearSearch = useLibraryStore((s) => s.clearSearch);
  const openSearchResult = useLibraryStore((s) => s.openSearchResult);
  const setView = useUiStore((s) => s.setView);

  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const inbox = projects.find((p) => p.id === INBOX_PROJECT_ID);
  const byParent = new Map<string | null, Project[]>();
  for (const project of projects) {
    if (project.id === INBOX_PROJECT_ID) continue;
    const key = project.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(project);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleImportProjectClick() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Satchel project", extensions: ["zip"] }],
    });
    if (!selected) return;
    await importProject(selected as string);
  }

  async function submitNewProject() {
    const name = newName.trim();
    if (name) {
      await createProject(name, creatingParentId ?? null);
    }
    setNewName("");
    setCreatingParentId(undefined);
  }

  function renderProjectTree(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    return children.map((project) => (
      <li key={project.id}>
        <div
          className={`project-item ${selectedProjectId === project.id ? "active" : ""}`}
          style={{ paddingLeft: `${0.6 + depth * 1}rem` }}
        >
          <span className="project-item-name" onClick={() => selectProject(project.id)}>
            {project.name}
          </span>
          <button
            className="project-item-add"
            title="New sub-project"
            onClick={() => {
              setCreatingParentId(project.id);
              setNewName("");
            }}
          >
            +
          </button>
        </div>
        {creatingParentId === project.id && renderNewProjectForm(depth + 1)}
        <ul className="project-list-nested">{renderProjectTree(project.id, depth + 1)}</ul>
      </li>
    ));
  }

  function renderNewProjectForm(depth: number) {
    return (
      <form
        className="new-project-form"
        style={{ paddingLeft: `${0.6 + depth * 1}rem` }}
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
    );
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">Satchel</div>

      <input
        className="sidebar-search"
        type="search"
        value={searchQuery}
        onChange={(e) => search(e.currentTarget.value)}
        placeholder="Search artifacts…"
      />

      {searchQuery ? (
        <div className="search-results">
          {searchResults.length === 0 ? (
            <div className="search-results-empty">No matches</div>
          ) : (
            <ul className="project-list">
              {searchResults.map((artifact) => (
                <li
                  key={artifact.id}
                  className="search-result-item"
                  onClick={() => openSearchResult(artifact)}
                >
                  <span className={`artifact-card-type type-${artifact.type}`}>
                    {TYPE_LABEL[artifact.type] ?? artifact.type}
                  </span>
                  <span className="search-result-title">{artifact.title}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="clear-search-button" onClick={clearSearch}>
            Clear search
          </button>
        </div>
      ) : (
        <>
          <ul className="project-list">
            {inbox && (
              <li>
                <div
                  className={`project-item ${selectedProjectId === inbox.id ? "active" : ""}`}
                  onClick={() => selectProject(inbox.id)}
                >
                  {inbox.name}
                </div>
              </li>
            )}
            {renderProjectTree(null, 0)}
          </ul>

          {creatingParentId === null && renderNewProjectForm(0)}

          <button
            className="new-project-button"
            onClick={() => {
              setCreatingParentId(null);
              setNewName("");
            }}
          >
            + New Project
          </button>
          <button className="import-project-button" onClick={handleImportProjectClick}>
            Import project…
          </button>
        </>
      )}

      <button className="settings-button" onClick={() => setView("settings")}>
        Settings
      </button>

      <div className="build-stamp" title="App version · build commit · channel">
        v{version || "…"} · {__GIT_SHA__} · {BUILD_CHANNEL}
      </div>
    </nav>
  );
}
