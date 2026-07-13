use crate::library::ArtifactManifest;
use crate::{db, library, AppState};
use tauri::State;

/// Rescans every project.json/manifest.json on disk and repopulates the
/// sqlite index from scratch. The filesystem is the source of truth, so this
/// is the recovery path if the index ever gets out of sync or corrupted.
#[tauri::command]
pub fn rebuild_index(state: State<AppState>) -> Result<(), String> {
    let (projects, artifacts) =
        library::list_all_manifests(&state.library_root).map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::rebuild_from_disk(&conn, &projects, &artifacts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_artifacts(state: State<AppState>, query: String) -> Result<Vec<ArtifactManifest>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::search_artifacts(&conn, &query).map_err(|e| e.to_string())
}
