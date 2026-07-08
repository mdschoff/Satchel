use crate::library::{self, ArtifactManifest, Project, CURRENT_SCHEMA_VERSION};
use crate::{db, AppState};
use base64::Engine;
use std::fs;
use tauri::State;

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    library::list_projects(&state.library_root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(state: State<AppState>, name: String, color: Option<String>) -> Result<Project, String> {
    let now = library::now_iso();
    let project = Project {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: library::new_id(),
        name,
        color,
        parent_id: None,
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
pub fn save_artifact_source(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
    content: String,
) -> Result<(), String> {
    let mut manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    let path = library::artifact_dir(&state.library_root, &project_id, &artifact_id)
        .join(&manifest.source_file);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    manifest.updated_at = library::now_iso();
    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_artifact(&conn, &manifest).map_err(|e| e.to_string())?;
    Ok(())
}
