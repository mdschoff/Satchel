use crate::library::{ArtifactManifest, Project, CURRENT_SCHEMA_VERSION};
use crate::{db, library, AppState};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::State;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[tauri::command]
pub fn export_project(
    state: State<AppState>,
    project_id: String,
    dest_path: String,
) -> Result<(), String> {
    let project_dir = library::project_dir(&state.library_root, &project_id);
    if !project_dir.exists() {
        return Err(format!("Project {project_id} not found"));
    }

    let file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    add_dir_to_zip(&mut zip, &project_dir, &project_dir, options).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Copies a single artifact's source file out to a standalone path the user
/// picked - "give me just this as a real file" so it can be shared or used
/// outside Satchel, without exporting the whole project.
#[tauri::command]
pub fn export_artifact(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
    dest_path: String,
) -> Result<(), String> {
    let manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    let source = library::artifact_dir(&state.library_root, &project_id, &artifact_id)
        .join(&manifest.source_file);
    fs::copy(&source, &dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// The default filename + extension to offer when exporting an artifact.
#[tauri::command]
pub fn artifact_export_name(
    state: State<AppState>,
    project_id: String,
    artifact_id: String,
) -> Result<String, String> {
    let manifest = library::read_manifest(&state.library_root, &project_id, &artifact_id)
        .map_err(|e| e.to_string())?;
    let ext = Path::new(&manifest.source_file)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt");
    // Sanitize the title into a filename.
    let stem: String = manifest
        .title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let stem = stem.trim_matches('-');
    let stem = if stem.is_empty() { "artifact" } else { stem };
    Ok(format!("{stem}.{ext}"))
}

/// Imports a project exported via `export_project` (by this or any other
/// Satchel install). Assigns fresh project/artifact ids rather than reusing
/// the ones from the export, so importing never collides with anything
/// already in the local library - including re-importing the same zip twice,
/// or importing back into the library it came from.
#[tauri::command]
pub fn import_project(state: State<AppState>, zip_path: String) -> Result<Project, String> {
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir().join(format!("satchel-import-{}", library::new_id()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let extracted = extract_zip(&mut archive, &temp_dir).map_err(|e| e.to_string());
    let result = extracted.and_then(|()| import_from_extracted(&state, &temp_dir));
    let _ = fs::remove_dir_all(&temp_dir);
    result
}

fn extract_zip(archive: &mut zip::ZipArchive<fs::File>, dest: &Path) -> std::io::Result<()> {
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(rel_path) = entry.enclosed_name() else { continue };
        let out_path = dest.join(rel_path);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out_file = fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out_file)?;
        }
    }
    Ok(())
}

fn import_from_extracted(state: &State<AppState>, extracted_dir: &Path) -> Result<Project, String> {
    let project_json = extracted_dir.join("project.json");
    let raw = fs::read_to_string(&project_json)
        .map_err(|_| "Not a valid Satchel project export (missing project.json)".to_string())?;
    let mut project: Project = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    project.id = library::new_id();
    project.parent_id = None;
    project.schema_version = CURRENT_SCHEMA_VERSION;
    let now = library::now_iso();
    project.created_at = now.clone();
    project.updated_at = now;
    library::write_project(&state.library_root, &project).map_err(|e| e.to_string())?;

    let mut artifacts = Vec::new();
    let old_artifacts_dir = extracted_dir.join("artifacts");
    if old_artifacts_dir.exists() {
        for entry in fs::read_dir(&old_artifacts_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            if let Some(manifest) = import_artifact_dir(state, &entry.path(), &project.id)? {
                artifacts.push(manifest);
            }
        }
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::upsert_project(&conn, &project).map_err(|e| e.to_string())?;
    for manifest in &artifacts {
        db::upsert_artifact(&conn, manifest).map_err(|e| e.to_string())?;
    }
    Ok(project)
}

fn import_artifact_dir(
    state: &State<AppState>,
    old_dir: &Path,
    new_project_id: &str,
) -> Result<Option<ArtifactManifest>, String> {
    let manifest_path = old_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let mut manifest: ArtifactManifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    manifest.id = library::new_id();
    manifest.project_id = new_project_id.to_string();

    let new_dir = library::artifact_dir(&state.library_root, new_project_id, &manifest.id);
    fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;

    let source_src = old_dir.join(&manifest.source_file);
    if source_src.exists() {
        fs::copy(&source_src, new_dir.join(&manifest.source_file)).map_err(|e| e.to_string())?;
    }

    let versions_src = old_dir.join("versions");
    if versions_src.exists() {
        let versions_dst = new_dir.join("versions");
        fs::create_dir_all(&versions_dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&versions_src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_file() {
                fs::copy(entry.path(), versions_dst.join(entry.file_name())).map_err(|e| e.to_string())?;
            }
        }
    }

    library::write_manifest(&state.library_root, &manifest).map_err(|e| e.to_string())?;
    Ok(Some(manifest))
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<fs::File>,
    base: &Path,
    dir: &Path,
    options: SimpleFileOptions,
) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(base).unwrap_or(&path);
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            zip.add_directory(format!("{rel_str}/"), options)?;
            add_dir_to_zip(zip, base, &path, options)?;
        } else {
            zip.start_file(rel_str, options)?;
            zip.write_all(&fs::read(&path)?)?;
        }
    }
    Ok(())
}
