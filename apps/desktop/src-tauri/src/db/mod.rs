use crate::library::{ArtifactManifest, Project, CURRENT_SCHEMA_VERSION};
use rusqlite::Connection;
use std::path::Path;

pub fn open(library_root: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(library_root.join("index.sqlite"))?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            parent_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            source_file TEXT NOT NULL,
            tags TEXT NOT NULL,
            source_note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
        ",
    )
}

pub fn upsert_project(conn: &Connection, project: &Project) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO projects (id, name, color, parent_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            color = excluded.color,
            parent_id = excluded.parent_id,
            updated_at = excluded.updated_at",
        (
            &project.id,
            &project.name,
            &project.color,
            &project.parent_id,
            &project.created_at,
            &project.updated_at,
        ),
    )?;
    Ok(())
}

pub fn upsert_artifact(conn: &Connection, manifest: &ArtifactManifest) -> rusqlite::Result<()> {
    let tags_json = serde_json::to_string(&manifest.tags).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT INTO artifacts (id, project_id, title, type, source_file, tags, source_note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            title = excluded.title,
            type = excluded.type,
            source_file = excluded.source_file,
            tags = excluded.tags,
            source_note = excluded.source_note,
            updated_at = excluded.updated_at",
        (
            &manifest.id,
            &manifest.project_id,
            &manifest.title,
            &manifest.artifact_type,
            &manifest.source_file,
            &tags_json,
            &manifest.source_note,
            &manifest.created_at,
            &manifest.updated_at,
        ),
    )?;
    Ok(())
}

pub fn delete_artifact(conn: &Connection, artifact_id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM artifacts WHERE id = ?1", [artifact_id])?;
    Ok(())
}

/// Wipes and repopulates both tables from whatever's on disk right now.
/// The sqlite index is a disposable cache, so this is safe to run any time
/// (startup, or a user-triggered "Rebuild Index") to recover from corruption.
pub fn rebuild_from_disk(
    conn: &Connection,
    projects: &[Project],
    artifacts: &[ArtifactManifest],
) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM projects", [])?;
    conn.execute("DELETE FROM artifacts", [])?;
    for project in projects {
        upsert_project(conn, project)?;
    }
    for artifact in artifacts {
        upsert_artifact(conn, artifact)?;
    }
    Ok(())
}

/// Searches by title/tags across every project. Reads straight from the
/// index rather than the filesystem since the index already carries every
/// field a manifest needs - callers get real ArtifactManifests, not just IDs
/// they'd have to look up again.
pub fn search_artifacts(conn: &Connection, query: &str) -> rusqlite::Result<Vec<ArtifactManifest>> {
    let pattern = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, type, source_file, tags, source_note, created_at, updated_at
         FROM artifacts
         WHERE lower(title) LIKE ?1 OR lower(tags) LIKE ?1
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([pattern], |row| {
        let tags_json: String = row.get(5)?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        Ok(ArtifactManifest {
            schema_version: CURRENT_SCHEMA_VERSION,
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            artifact_type: row.get(3)?,
            source_file: row.get(4)?,
            tags,
            source_note: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}
