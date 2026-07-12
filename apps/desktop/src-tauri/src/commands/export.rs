use crate::{library, AppState};
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
