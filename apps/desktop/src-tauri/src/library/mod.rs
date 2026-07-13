use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
pub const INBOX_PROJECT_ID: &str = "inbox";
/// How many past versions of an artifact's source to keep around.
const MAX_VERSIONS_KEPT: usize = 20;

#[derive(Debug, Serialize, Deserialize, Clone, JsonSchema)]
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

#[derive(Debug, Serialize, Deserialize, Clone, JsonSchema)]
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

#[derive(Debug, Serialize, Deserialize, Clone, JsonSchema)]
pub struct ArtifactVersion {
    /// Sortable snapshot id (also its filename under versions/) - newest sorts last.
    pub timestamp: String,
    pub size: u64,
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

pub fn read_project(library_root: &Path, project_id: &str) -> Result<Project> {
    let path = project_dir(library_root, project_id).join("project.json");
    let raw = fs::read_to_string(&path)
        .map_err(|_| LibraryError::NotFound(format!("project {project_id}")))?;
    Ok(serde_json::from_str(&raw)?)
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

/// Reverse of `detect_type_from_extension`, for creating an artifact from raw
/// content (no source file to sniff an extension from). Only text-based types
/// are supported - image/pdf artifacts arrive as real files via import, not
/// as inline content from a tool call.
pub fn extension_for_type(artifact_type: &str) -> Option<&'static str> {
    match artifact_type {
        "html" => Some("html"),
        "svg" => Some("svg"),
        "markdown" => Some("md"),
        "jsx" => Some("jsx"),
        "tsx" => Some("tsx"),
        _ => None,
    }
}

pub fn versions_dir(library_root: &Path, project_id: &str, artifact_id: &str) -> PathBuf {
    artifact_dir(library_root, project_id, artifact_id).join("versions")
}

/// Copies an artifact's current source into its version history before it
/// gets overwritten. Called on every save (manual or AI-driven, since both
/// paths go through the same save_artifact_source command) and before a
/// restore, so restoring is itself never destructive.
pub fn snapshot_current_source(library_root: &Path, manifest: &ArtifactManifest) -> Result<()> {
    let source_path =
        artifact_dir(library_root, &manifest.project_id, &manifest.id).join(&manifest.source_file);
    if !source_path.exists() {
        return Ok(());
    }
    let dir = versions_dir(library_root, &manifest.project_id, &manifest.id);
    fs::create_dir_all(&dir)?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ").to_string();
    fs::copy(&source_path, dir.join(&stamp))?;
    prune_versions(&dir, MAX_VERSIONS_KEPT)?;
    Ok(())
}

fn prune_versions(dir: &Path, keep: usize) -> Result<()> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();
    if entries.len() > keep {
        for old in &entries[..entries.len() - keep] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(())
}

pub fn list_versions(
    library_root: &Path,
    project_id: &str,
    artifact_id: &str,
) -> Result<Vec<ArtifactVersion>> {
    let dir = versions_dir(library_root, project_id, artifact_id);
    let mut versions = Vec::new();
    if !dir.exists() {
        return Ok(versions);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let timestamp = entry.file_name().to_string_lossy().to_string();
        let size = entry.metadata()?.len();
        versions.push(ArtifactVersion { timestamp, size });
    }
    versions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(versions)
}
