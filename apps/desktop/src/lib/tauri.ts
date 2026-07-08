import { invoke } from "@tauri-apps/api/core";
import type { ArtifactManifest, Project } from "@satchel/artifact-core";

export const backend = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (name: string, color: string | null) =>
    invoke<Project>("create_project", { name, color }),
  listArtifacts: (projectId: string) =>
    invoke<ArtifactManifest[]>("list_artifacts", { projectId }),
  importArtifact: (projectId: string, sourcePath: string) =>
    invoke<ArtifactManifest>("import_artifact", { projectId, sourcePath }),
  getArtifactSource: (projectId: string, artifactId: string) =>
    invoke<string>("get_artifact_source", { projectId, artifactId }),
  saveArtifactSource: (projectId: string, artifactId: string, content: string) =>
    invoke<void>("save_artifact_source", { projectId, artifactId, content }),
  moveArtifact: (artifactId: string, fromProjectId: string, toProjectId: string) =>
    invoke<ArtifactManifest>("move_artifact", { artifactId, fromProjectId, toProjectId }),
  rebuildIndex: () => invoke<void>("rebuild_index"),
  searchArtifacts: (query: string) => invoke<string[]>("search_artifacts", { query }),
  saveSecret: (providerId: string, value: string) =>
    invoke<void>("save_secret", { providerId, value }),
  getSecret: (providerId: string) => invoke<string | null>("get_secret", { providerId }),
  deleteSecret: (providerId: string) => invoke<void>("delete_secret", { providerId }),
};
