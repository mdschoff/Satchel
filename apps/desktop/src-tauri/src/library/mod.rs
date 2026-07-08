use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
pub const INBOX_PROJECT_ID: &str = "inbox";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtifactManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub artifact_type: String,
    #[serde(rename = "sourceFile")]
    pub source_file: String,
    pub tags: Vec<String>,
    #[serde(rename = "sourceNote")]
    pub source_note: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(thiserror::Error, Debug)]
pub enum LibraryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, LibraryError>;

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn projects_dir(library_root: &Path) -> PathBuf {
    library_root.join("projects")
}

pub fn project_dir(library_root: &Path, project_id: &str) -> PathBuf {
    projects_dir(library_root).join(project_id)
}

pub fn artifacts_dir(library_root: &Path, project_id: &str) -> PathBuf {
    project_dir(library_root, project_id).join("artifacts")
}

pub fn artifact_dir(library_root: &Path, project_id: &str, artifact_id: &str) -> PathBuf {
    artifacts_dir(library_root, project_id).join(artifact_id)
}

/// Ensures the library root and the always-present Inbox project exist.
/// Safe to call on every launch - all operations are no-ops if already present.
pub fn ensure_library_initialized(library_root: &Path) -> Result<()> {
    fs::create_dir_all(projects_dir(library_root))?;
    let inbox_dir = project_dir(library_root, INBOX_PROJECT_ID);
    if !inbox_dir.join("project.json").exists() {
        fs::create_dir_all(&inbox_dir)?;
        fs::create_dir_all(artifacts_dir(library_root, INBOX_PROJECT_ID))?;
        let now = now_iso();
        let inbox = Project {
            schema_version: CURRENT_SCHEMA_VERSION,
            id: INBOX_PROJECT_ID.to_string(),
            name: "Inbox".to_string(),
            color: None,
            parent_id: None,
            created_at: now.clone(),
            updated_at: now,
        };
        write_project(library_root, &inbox)?;
    }
    Ok(())
}

pub fn write_project(library_root: &Path, project: &Project) -> Result<()> {
    let dir = project_dir(library_root, &project.id);
    fs::create_dir_all(&dir)?;
    fs::create_dir_all(artifacts_dir(library_root, &project.id))?;
    let path = dir.join("project.json");
    fs::write(path, serde_json::to_string_pretty(project)?)?;
    Ok(())
}

pub fn list_projects(library_root: &Path) -> Result<Vec<Project>> {
    let dir = projects_dir(library_root);
    let mut projects = Vec::new();
    if !dir.exists() {
        return Ok(projects);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let manifest_path = entry.path().join("project.json");
        if manifest_path.exists() {
            let raw = fs::read_to_string(manifest_path)?;
            if let Ok(project) = serde_json::from_str::<Project>(&raw) {
                projects.push(project);
            }
        }
    }
    Ok(projects)
}

pub fn write_manifest(library_root: &Path, manifest: &ArtifactManifest) -> Result<()> {
    let dir = artifact_dir(library_root, &manifest.project_id, &manifest.id);
    fs::create_dir_all(&dir)?;
    let path = dir.join("manifest.json");
    fs::write(path, serde_json::to_string_pretty(manifest)?)?;
    Ok(())
}

pub fn read_manifest(
    library_root: &Path,
    project_id: &str,
    artifact_id: &str,
) -> Result<ArtifactManifest> {
    let path = artifact_dir(library_root, project_id, artifact_id).join("manifest.json");
    let raw = fs::read_to_string(&path)
        .map_err(|_| LibraryError::NotFound(format!("artifact {artifact_id}")))?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn list_artifacts(library_root: &Path, project_id: &str) -> Result<Vec<ArtifactManifest>> {
    let dir = artifacts_dir(library_root, project_id);
    let mut artifacts = Vec::new();
    if !dir.exists() {
        return Ok(artifacts);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let manifest_path = entry.path().join("manifest.json");
        if manifest_path.exists() {
            let raw = fs::read_to_string(manifest_path)?;
            if let Ok(manifest) = serde_json::from_str::<ArtifactManifest>(&raw) {
                artifacts.push(manifest);
            }
        }
    }
    Ok(artifacts)
}

/// Scans every project.json/manifest.json on disk. Used both at startup and
/// on-demand to rebuild the sqlite index, since the filesystem - not the
/// database - is the source of truth.
pub fn list_all_manifests(library_root: &Path) -> Result<(Vec<Project>, Vec<ArtifactManifest>)> {
    let projects = list_projects(library_root)?;
    let mut all_artifacts = Vec::new();
    for project in &projects {
        all_artifacts.extend(list_artifacts(library_root, &project.id)?);
    }
    Ok((projects, all_artifacts))
}

const EXTENSION_TYPE_MAP: &[(&str, &str)] = &[
    ("html", "html"),
    ("htm", "html"),
    ("svg", "svg"),
    ("md", "markdown"),
    ("markdown", "markdown"),
    ("jsx", "jsx"),
    ("tsx", "tsx"),
    ("png", "image"),
    ("jpg", "image"),
    ("jpeg", "image"),
    ("gif", "image"),
    ("webp", "image"),
    ("pdf", "pdf"),
];

pub fn detect_type_from_extension(filename: &str) -> Option<&'static str> {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())?;
    EXTENSION_TYPE_MAP
        .iter()
        .find(|(candidate, _)| *candidate == ext)
        .map(|(_, artifact_type)| *artifact_type)
}
