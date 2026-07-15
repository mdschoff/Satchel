import { invoke } from "@tauri-apps/api/core";
import type { ArtifactManifest, ArtifactVersion, Project } from "@satchel/artifact-core";

export const backend = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (name: string, color: string | null, parentId: string | null) =>
    invoke<Project>("create_project", { name, color, parentId }),
  renameProject: (projectId: string, name: string) =>
    invoke<Project>("rename_project", { projectId, name }),
  deleteProject: (projectId: string) => invoke<void>("delete_project", { projectId }),
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
  renameArtifact: (projectId: string, artifactId: string, title: string) =>
    invoke<ArtifactManifest>("rename_artifact", { projectId, artifactId, title }),
  setArtifactTags: (projectId: string, artifactId: string, tags: string[]) =>
    invoke<ArtifactManifest>("set_artifact_tags", { projectId, artifactId, tags }),
  duplicateArtifact: (projectId: string, artifactId: string) =>
    invoke<ArtifactManifest>("duplicate_artifact", { projectId, artifactId }),
  deleteArtifact: (projectId: string, artifactId: string) =>
    invoke<void>("delete_artifact", { projectId, artifactId }),
  rebuildIndex: () => invoke<void>("rebuild_index"),
  searchArtifacts: (query: string) => invoke<ArtifactManifest[]>("search_artifacts", { query }),
  saveSecret: (providerId: string, value: string) =>
    invoke<void>("save_secret", { providerId, value }),
  getSecret: (providerId: string) => invoke<string | null>("get_secret", { providerId }),
  deleteSecret: (providerId: string) => invoke<void>("delete_secret", { providerId }),
  listArtifactVersions: (projectId: string, artifactId: string) =>
    invoke<ArtifactVersion[]>("list_artifact_versions", { projectId, artifactId }),
  readArtifactVersion: (projectId: string, artifactId: string, timestamp: string) =>
    invoke<string>("read_artifact_version", { projectId, artifactId, timestamp }),
  restoreArtifactVersion: (projectId: string, artifactId: string, timestamp: string) =>
    invoke<void>("restore_artifact_version", { projectId, artifactId, timestamp }),
  exportProject: (projectId: string, destPath: string) =>
    invoke<void>("export_project", { projectId, destPath }),
  exportArtifact: (projectId: string, artifactId: string, destPath: string) =>
    invoke<void>("export_artifact", { projectId, artifactId, destPath }),
  artifactExportName: (projectId: string, artifactId: string) =>
    invoke<string>("artifact_export_name", { projectId, artifactId }),
  importProject: (zipPath: string) => invoke<Project>("import_project", { zipPath }),
  createArtifactFromContent: (
    projectId: string | null,
    title: string,
    artifactType: string,
    content: string,
  ) =>
    invoke<ArtifactManifest>("create_artifact_from_content", {
      projectId,
      title,
      artifactType,
      content,
    }),
};
