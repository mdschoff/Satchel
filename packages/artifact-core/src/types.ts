/**
 * Shared data model for Satchel. These shapes are the on-disk contract between
 * the Rust backend (library/db) and the frontend, and between the frontend and
 * every renderer / AI provider plugin. Bump schemaVersion when a shape changes
 * in a way older manifests can't be read as-is, and add a migration in the
 * Rust db layer rather than mutating the shape in place.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export type ArtifactType =
  | "html"
  | "svg"
  | "markdown"
  | "jsx"
  | "tsx"
  | "image"
  | "pdf";

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  color: string | null;
  /** Reserved for nested sub-folders; always null in v1 but kept so nesting
   * doesn't require a migration later. */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const INBOX_PROJECT_ID = "inbox";

export interface ArtifactManifest {
  schemaVersion: number;
  id: string;
  projectId: string;
  title: string;
  type: ArtifactType;
  /** Filename of the primary source file inside this artifact's folder,
   * e.g. "source.html". Resolved relative to the artifact's own directory. */
  sourceFile: string;
  tags: string[];
  /** Free-text note on provenance, e.g. "Claude, 2026-07-08" - never parsed. */
  sourceNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditHistoryEntry {
  timestamp: string;
  /** "manual" for hand edits, or the AI provider id (e.g. "claude") for AI edits */
  actor: string;
  instruction: string | null;
}
