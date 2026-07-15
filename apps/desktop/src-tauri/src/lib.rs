mod commands;
mod db;
mod library;
mod mcp;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub library_root: PathBuf,
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let library_root = app
                .path()
                .app_data_dir()
                .expect("app_data_dir should be resolvable")
                .join("library");

            library::ensure_library_initialized(&library_root)
                .expect("failed to initialize library directories");

            let conn = db::open(&library_root).expect("failed to open sqlite index");
            let (projects, artifacts) =
                library::list_all_manifests(&library_root).expect("failed to scan library");
            db::rebuild_from_disk(&conn, &projects, &artifacts)
                .expect("failed to rebuild sqlite index at startup");

            app.manage(AppState {
                library_root,
                db: Mutex::new(conn),
            });

            mcp::spawn(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_projects,
            commands::library::create_project,
            commands::library::rename_project,
            commands::library::delete_project,
            commands::library::list_artifacts,
            commands::library::get_artifact_source,
            commands::library::save_artifact_source,
            commands::library::move_artifact,
            commands::library::rename_artifact,
            commands::library::set_artifact_tags,
            commands::library::duplicate_artifact,
            commands::library::delete_artifact,
            commands::library::list_artifact_versions,
            commands::library::read_artifact_version,
            commands::library::restore_artifact_version,
            commands::library::create_artifact_from_content,
            commands::export::export_project,
            commands::export::export_artifact,
            commands::export::artifact_export_name,
            commands::export::import_project,
            commands::ingest::import_artifact,
            commands::index::rebuild_index,
            commands::index::search_artifacts,
            commands::secrets::save_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
