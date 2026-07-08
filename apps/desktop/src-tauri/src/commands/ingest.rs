use crate::library::{self, ArtifactManifest, CURRENT_SCHEMA_VERSION};
use crate::{db, AppState};
use std::fs;
use std::path::Path;
use tauri::State;

/// Imports a file from anywhere on disk (drag-drop or the Finder dialog) into
/// the given project. The type is detected from the file's extension; files
/// of an unrecognized type are rejected rather than guessed at.
#[tauri::command]
pub fn import_artifact(
    state: State<AppState>,
    project_id: String,
    source_path: String,
) -> Result<ArtifactManifest, String> {
    let src = Path::new(&source_path);
    let filename = src
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid source path".to_string())?;

    let artifact_type = library::detect_type_from_extension(filename)
        .ok_or_else(|| format!("Unrecognized artifact type for file: {filename}"))?;

    let extension = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("dat");
    let title = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename)
        .to_string();

    let artifact_id = library::new_id();
    let dest_dir = library::artifact_dir(&state.library_root, &project_id, &artifact_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let source_file = format!("source.{extension}");
    fs::copy(src, dest_dir.join(&source_file)).map_err(|e| e.to_string())?;

    let now = library::now_iso();
    let manifest = ArtifactManifest {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: artifact_id,
        project_id,
        title,
        artifact_type: artifact_type.to_string(),
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
