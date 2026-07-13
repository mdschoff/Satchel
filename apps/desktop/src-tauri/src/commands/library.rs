use crate::library::{self, ArtifactManifest, ArtifactVersion, Project, CURRENT_SCHEMA_VERSION, INBOX_PROJECT_ID};
use crate::{db, AppState};
use base64::Engine;
use std::fs;
use tauri::State;

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    library::list_projects(&state.library_root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(
    state: State<AppState>,
    name: String,
    color: Option<String>,
    parent_id: Option<String>,
) -> Result<Project, String> {
    let now = library::now_iso();
    let project = Project {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: library::new_id(),
        name,
        color,
        parent_id,
        created_at: now.clone(),
        updated_at: now,
    };
    library::write_project(&state.library_root, &project).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_project(&conn, &project).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
pub fn list_artifacts(state: State<AppState>, project_id: String) -> Result<Vec<ArtifactManifest>, String> {
    library::list_artifacts(&state.library_root, &project_id).map_err(|e| e.to_string())
}

fn mime_for_type(artifact_type: &str, source_file: &str) -> String {
    if artifact_type == "image" {
        let ext = std::path::Path::new(source_file)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let sub = if ext == "jpg" { "jpeg".to_string() } else { ext };
        return format!("image/{sub}");
    }
    "application/pdf".to_string()
}

/// Text artifacts are returned as raw UTF-8; binary artifacts (image/pdf) are
/// returned as a data: URL, so every renderer's render() can accept a plain
/// string regardless of the underlying artifact type.
#[tauri::command]
pub fn get_artifact_source(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
) -> Result<String, String> {
    let manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    let path = library::artifact_dir(&state.library_root, &project_id, &artifact_id)
        .join(&manifest.source_file);

    if manifest.artifact_type == "image" || manifest.artifact_type == "pdf" {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let mime = mime_for_type(&manifest.artifact_type, &manifest.source_file);
        Ok(format!("data:{mime};base64,{encoded}"))
    } else {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn move_artifact(
    state: State<AppState>,
    artifact_id: String,
    from_project_id: String,
    to_project_id: String,
) -> Result<ArtifactManifest, String> {
    if from_project_id == to_project_id {
        return library::read_manifest(&state.library_root, &from_project_id, &artifact_id)
            .map_err(|e| e.to_string());
    }

    let mut manifest = library::read_manifest(&state.library_root, &from_project_id, &artifact_id)
        .map_err(|e| e.to_string())?;

    let old_dir = library::artifact_dir(&state.library_root, &from_project_id, &artifact_id);
    let new_dir = library::artifact_dir(&state.library_root, &to_project_id, &artifact_id);
    fs::create_dir_all(library::artifacts_dir(&state.library_root, &to_project_id))
        .map_err(|e| e.to_string())?;
    fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())?;

    manifest.project_id = to_project_id;
    manifest.updated_at = library::now_iso();
    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_artifact(&conn, &manifest).map_err(|e| e.to_string())?;
    Ok(manifest)
}

#[tauri::command]
pub fn delete_artifact(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
) -> Result<(), String> {
    let dir = library::artifact_dir(&state.library_root, &project_id, &artifact_id);
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_artifact(&conn, &artifact_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_artifact_source(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
    content: String,
) -> Result<(), String> {
    let mut manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    library::snapshot_current_source(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    let path = library::artifact_dir(&state.library_root, &project_id, &artifact_id)
        .join(&manifest.source_file);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    manifest.updated_at = library::now_iso();
    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_artifact(&conn, &manifest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_artifact_versions(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
) -> Result<Vec<ArtifactVersion>, String> {
    library::list_versions(&state.library_root, &project_id, &artifact_id).map_err(|e| e.to_string())
}

/// Restoring is itself non-destructive: the about-to-be-replaced content gets
/// snapshotted first, so restoring an old version is just another entry in
/// the same history, not a one-way trip.
#[tauri::command]
pub fn restore_artifact_version(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
    timestamp: String,
) -> Result<(), String> {
    let mut manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    library::snapshot_current_source(&state.library_root, &manifest).map_err(|e| e.to_string())?;

    let version_path =
        library::versions_dir(&state.library_root, &project_id, &artifact_id).join(&timestamp);
    let content = fs::read(&version_path).map_err(|e| e.to_string())?;
    let source_path = library::artifact_dir(&state.library_root, &project_id, &artifact_id)
        .join(&manifest.source_file);
    fs::write(&source_path, content).map_err(|e| e.to_string())?;

    manifest.updated_at = library::now_iso();
    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_artifact(&conn, &manifest).map_err(|e| e.to_string())?;
    Ok(())
}

/// Creates a new artifact directly from content rather than importing an
/// existing file - used by the MCP server so an AI tool call can push an
/// artifact straight into the library without round-tripping through a file
/// on disk first. Binary types (image/pdf) aren't supported here; those
/// always arrive as real files via `import_artifact`.
#[tauri::command]
pub fn create_artifact_from_content(
    state: State<AppState>,
    project_id: Option<String>,
    title: String,
    artifact_type: String,
    content: String,
) -> Result<ArtifactManifest, String> {
    let project_id = project_id.unwrap_or_else(|| INBOX_PROJECT_ID.to_string());
    let extension = library::extension_for_type(&artifact_type)
        .ok_or_else(|| format!("Unsupported artifact type for inline content: {artifact_type}"))?;

    let artifact_id = library::new_id();
    let dest_dir = library::artifact_dir(&state.library_root, &project_id, &artifact_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let source_file = format!("source.{extension}");
    fs::write(dest_dir.join(&source_file), content).map_err(|e| e.to_string())?;

    let now = library::now_iso();
    let manifest = ArtifactManifest {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: artifact_id,
        project_id,
        title,
        artifact_type,
        source_file,
        tags: Vec::new(),
        source_note: None,
        created_at: now.clone(),
        updated_at: now,
    };
    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_artifact(&conn, &manifest).map_err(|e| e.to_string())?;
    Ok(manifest)
}
