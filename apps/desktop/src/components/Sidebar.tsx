import { useEffect, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import type { Project } from "@satchel/artifact-core";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { useLibraryStore } from "../state/library";
import { useUiStore } from "../state/ui";
import { useDndStore } from "../state/dnd";
import { backend } from "../lib/tauri";

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
  const renameProject = useLibraryStore((s) => s.renameProject);
  const deleteProject = useLibraryStore((s) => s.deleteProject);
  const importProject = useLibraryStore((s) => s.importProject);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const searchResults = useLibraryStore((s) => s.searchResults);
  const search = useLibraryStore((s) => s.search);
  const clearSearch = useLibraryStore((s) => s.clearSearch);
  const openSearchResult = useLibraryStore((s) => s.openSearchResult);
  const setView = useUiStore((s) => s.setView);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const requestNewProject = useUiStore((s) => s.requestNewProject);
  const newProjectNonce = useUiStore((s) => s.newProjectNonce);
  const dragActive = useDndStore((s) => s.draggingIds.length > 0);
  const overProjectId = useDndStore((s) => s.overProjectId);

  const dropClass = (id: string) =>
    dragActive && overProjectId === id && id !== selectedProjectId ? "drop-target" : "";

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Unknown";

  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [version, setVersion] = useState("");
  const [projectMenu, setProjectMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  // Close the project menu on Escape.
  useEffect(() => {
    if (!projectMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectMenu]);

  function openProjectMenu(e: React.MouseEvent, project: Project) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setProjectMenu({ id: project.id, name: project.name, x: Math.max(8, x), y: Math.max(8, y) });
  }

  function startRename(id: string, name: string) {
    setProjectMenu(null);
    setRenamingId(id);
    setRenameValue(name);
  }

  function commitRename() {
    if (renamingId) renameProject(renamingId, renameValue);
    setRenamingId(null);
  }

  async function exportProjectFlow(id: string, name: string) {
    setProjectMenu(null);
    const dest = await save({
      title: "Export project",
      defaultPath: `${name}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (dest) await backend.exportProject(id, dest);
  }

  async function deleteProjectFlow(id: string, name: string) {
    setProjectMenu(null);
    const ok = await confirm(
      `Delete "${name}" and everything in it? Any sub-projects move up a level. This can't be undone.`,
      { title: "Delete project", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (ok) deleteProject(id);
  }

  // Open the top-level "new project" form when ⌘N / the grid menu asks for it.
  const firstNonce = useRef(newProjectNonce);
  useEffect(() => {
    if (newProjectNonce === firstNonce.current) return;
    setCreatingParentId(null);
    setNewName("");
  }, [newProjectNonce]);

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
          className={`project-item ${selectedProjectId === project.id ? "active" : ""} ${dropClass(project.id)}`}
          data-project-id={project.id}
          style={{ paddingLeft: `${0.6 + depth * 1}rem` }}
          onContextMenu={(e) => openProjectMenu(e, project)}
        >
          {renamingId === project.id ? (
            <input
              className="project-rename-input"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.currentTarget.value)}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="project-item-name" onClick={() => selectProject(project.id)}>
              {project.name}
            </span>
          )}
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

  const topLevel = byParent.get(null) ?? [];

  if (collapsed) {
    return (
      <nav className="sidebar-rail">
        <button
          className="rail-btn"
          title="Expand sidebar (⌘B)"
          onClick={() => setSidebarCollapsed(false)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
        <button
          className="rail-btn"
          title="Search (⌘K)"
          onClick={() => {
            setSidebarCollapsed(false);
            setTimeout(() => document.querySelector<HTMLInputElement>(".sidebar-search")?.focus(), 0);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <div className="rail-sep" />
        <div className="rail-projects">
          {inbox && (
            <button
              className={`rail-project ${selectedProjectId === inbox.id ? "active" : ""} ${dropClass(inbox.id)}`}
              data-project-id={inbox.id}
              title={inbox.name}
              onClick={() => selectProject(inbox.id)}
            >
              {inbox.name.charAt(0).toUpperCase()}
            </button>
          )}
          {topLevel.map((p) => (
            <button
              key={p.id}
              className={`rail-project ${selectedProjectId === p.id ? "active" : ""} ${dropClass(p.id)}`}
              data-project-id={p.id}
              title={p.name}
              onClick={() => selectProject(p.id)}
            >
              {p.name.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
        <div className="rail-spacer" />
        <button className="rail-btn" title="New project (⌘N)" onClick={requestNewProject}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="rail-btn" title="Settings (⌘,)" onClick={() => setView("settings")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </nav>
    );
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Satchel</span>
        <button
          className="sidebar-collapse"
          title="Collapse sidebar (⌘B)"
          onClick={() => setSidebarCollapsed(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
      </div>

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
                  <span className="search-result-text">
                    <span className="search-result-title">{artifact.title}</span>
                    <span className="search-result-project">{projectName(artifact.projectId)}</span>
                  </span>
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
                  className={`project-item ${selectedProjectId === inbox.id ? "active" : ""} ${dropClass(inbox.id)}`}
                  data-project-id={inbox.id}
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

      {projectMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setProjectMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setProjectMenu(null);
            }}
          />
          <div className="context-menu" style={{ left: projectMenu.x, top: projectMenu.y }} role="menu">
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => startRename(projectMenu.id, projectMenu.name)}
            >
              Rename
            </button>
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => {
                setCreatingParentId(projectMenu.id);
                setNewName("");
                setProjectMenu(null);
              }}
            >
              New sub-project
            </button>
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => exportProjectFlow(projectMenu.id, projectMenu.name)}
            >
              Export project…
            </button>
            <div className="context-menu-sep" />
            <button
              className="context-menu-item danger"
              role="menuitem"
              onClick={() => deleteProjectFlow(projectMenu.id, projectMenu.name)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
