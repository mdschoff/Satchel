import { create } from "zustand";
import type { ArtifactManifest, Project } from "@satchel/artifact-core";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { backend } from "../lib/tauri";
import { useUiStore } from "./ui";

interface LibraryState {
  projects: Project[];
  selectedProjectId: string;
  artifacts: ArtifactManifest[];
  selectedArtifactId: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: ArtifactManifest[];
  /** When set, ArtifactView opens straight into the editor for this id (new notes). */
  editIntentId: string | null;

  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  createProject: (name: string, parentId?: string | null) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  importPaths: (paths: string[]) => Promise<void>;
  importProject: (zipPath: string) => Promise<void>;
  createFromContent: (title: string, artifactType: string, content: string) => Promise<void>;
  createNote: () => Promise<void>;
  duplicateArtifact: (artifactId: string) => Promise<void>;
  clearEditIntent: () => void;
  selectArtifact: (artifactId: string | null) => void;
  refreshArtifacts: () => Promise<void>;
  moveArtifact: (artifactId: string, fromProjectId: string, toProjectId: string) => Promise<void>;
  moveArtifacts: (ids: string[], fromProjectId: string, toProjectId: string) => Promise<void>;
  renameArtifact: (artifactId: string, title: string) => Promise<void>;
  setArtifactTags: (artifactId: string, tags: string[]) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  openSearchResult: (artifact: ArtifactManifest) => void;
  syncExternal: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  projects: [],
  selectedProjectId: INBOX_PROJECT_ID,
  artifacts: [],
  selectedArtifactId: null,
  isLoading: false,
  error: null,
  searchQuery: "",
  searchResults: [],
  editIntentId: null,

  async loadProjects() {
    set({ isLoading: true, error: null });
    try {
      const projects = await backend.listProjects();
      set({ projects, isLoading: false });
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  async selectProject(projectId: string) {
    // Selecting a project always lands you on its grid - leave Settings if open.
    useUiStore.getState().setView("library");
    set({ selectedProjectId: projectId, selectedArtifactId: null });
    await get().refreshArtifacts();
  },

  async createProject(name: string, parentId: string | null = null) {
    await backend.createProject(name, null, parentId);
    await get().loadProjects();
  },

  async renameProject(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await backend.renameProject(projectId, trimmed);
      await get().loadProjects();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async deleteProject(projectId: string) {
    try {
      await backend.deleteProject(projectId);
      // If we deleted the open project, fall back to the Inbox.
      if (get().selectedProjectId === projectId) {
        await get().selectProject(INBOX_PROJECT_ID);
      }
      await get().loadProjects();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async importPaths(paths: string[]) {
    const projectId = get().selectedProjectId;
    for (const path of paths) {
      try {
        await backend.importArtifact(projectId, path);
      } catch (err) {
        set({ error: String(err) });
      }
    }
    await get().refreshArtifacts();
  },

  async importProject(zipPath: string) {
    try {
      const project = await backend.importProject(zipPath);
      await get().loadProjects();
      await get().selectProject(project.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async createFromContent(title: string, artifactType: string, content: string) {
    try {
      await backend.createArtifactFromContent(get().selectedProjectId, title, artifactType, content);
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async createNote() {
    try {
      const note = await backend.createArtifactFromContent(
        get().selectedProjectId,
        "Untitled note",
        "markdown",
        "# Untitled note\n\n",
      );
      await get().refreshArtifacts();
      set({ selectedArtifactId: note.id, editIntentId: note.id });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async duplicateArtifact(artifactId: string) {
    try {
      const copy = await backend.duplicateArtifact(get().selectedProjectId, artifactId);
      await get().refreshArtifacts();
      set({ selectedArtifactId: copy.id });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  clearEditIntent() {
    set({ editIntentId: null });
  },

  selectArtifact(artifactId: string | null) {
    set({ selectedArtifactId: artifactId });
  },

  async refreshArtifacts() {
    const projectId = get().selectedProjectId;
    try {
      const artifacts = await backend.listArtifacts(projectId);
      set({ artifacts });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async moveArtifact(artifactId, fromProjectId, toProjectId) {
    if (fromProjectId === toProjectId) return;
    try {
      await backend.moveArtifact(artifactId, fromProjectId, toProjectId);
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async moveArtifacts(ids, fromProjectId, toProjectId) {
    if (fromProjectId === toProjectId || ids.length === 0) return;
    try {
      for (const id of ids) {
        await backend.moveArtifact(id, fromProjectId, toProjectId);
      }
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async renameArtifact(artifactId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await backend.renameArtifact(get().selectedProjectId, artifactId, trimmed);
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async setArtifactTags(artifactId: string, tags: string[]) {
    try {
      await backend.setArtifactTags(get().selectedProjectId, artifactId, tags);
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async deleteArtifact(artifactId: string) {
    const projectId = get().selectedProjectId;
    try {
      await backend.deleteArtifact(projectId, artifactId);
      if (get().selectedArtifactId === artifactId) {
        set({ selectedArtifactId: null });
      }
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async search(query: string) {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const searchResults = await backend.searchArtifacts(query);
      set({ searchResults });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  clearSearch() {
    set({ searchQuery: "", searchResults: [] });
  },

  openSearchResult(artifact: ArtifactManifest) {
    useUiStore.getState().setView("library");
    set({
      selectedProjectId: artifact.projectId,
      selectedArtifactId: artifact.id,
      searchQuery: "",
      searchResults: [],
    });
    get().refreshArtifacts();
  },

  // Refresh projects + current artifacts without the loading flicker, in
  // response to an out-of-band change (e.g. an AI client mutating the library
  // over MCP).
  async syncExternal() {
    try {
      const projects = await backend.listProjects();
      set({ projects });
      await get().refreshArtifacts();
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
