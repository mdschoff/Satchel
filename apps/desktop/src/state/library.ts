import { create } from "zustand";
import type { ArtifactManifest, Project } from "@satchel/artifact-core";
import { INBOX_PROJECT_ID } from "@satchel/artifact-core";
import { backend } from "../lib/tauri";

interface LibraryState {
  projects: Project[];
  selectedProjectId: string;
  artifacts: ArtifactManifest[];
  selectedArtifactId: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: ArtifactManifest[];

  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  createProject: (name: string, parentId?: string | null) => Promise<void>;
  importPaths: (paths: string[]) => Promise<void>;
  selectArtifact: (artifactId: string | null) => void;
  refreshArtifacts: () => Promise<void>;
  moveArtifact: (artifactId: string, fromProjectId: string, toProjectId: string) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  openSearchResult: (artifact: ArtifactManifest) => void;
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
    set({ selectedProjectId: projectId, selectedArtifactId: null });
    await get().refreshArtifacts();
  },

  async createProject(name: string, parentId: string | null = null) {
    await backend.createProject(name, null, parentId);
    await get().loadProjects();
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
    set({
      selectedProjectId: artifact.projectId,
      selectedArtifactId: artifact.id,
      searchQuery: "",
      searchResults: [],
    });
    get().refreshArtifacts();
  },
}));
