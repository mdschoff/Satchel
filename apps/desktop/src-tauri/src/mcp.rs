//! Exposes the artifact library over MCP (Streamable HTTP, localhost-only)
//! so MCP-aware tools - Claude Code, Claude Desktop, Cursor, etc. - can list,
//! search, create, and update artifacts directly from a conversation instead
//! of round-tripping through manual export + drag-in.
//!
//! Tool handlers are thin wrappers around the same command functions the
//! Tauri IPC layer calls, obtained via `AppHandle::state()` - no logic is
//! duplicated between the two transports.

use crate::library::{ArtifactManifest, ArtifactVersion, Project};
use crate::{commands, AppState};
use base64::Engine;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// Event the backend emits to the frontend whenever an MCP tool mutates the
/// library, so the UI can refresh the grid and live-reload an open artifact
/// as an AI client works through it. Payload carries the affected ids.
const LIBRARY_CHANGED_EVENT: &str = "library:changed";

/// Bound to localhost only - this is a convenience for tools running on the
/// same machine, not a general-purpose network service.
pub const MCP_PORT: u16 = 7825;

fn mcp_err(message: String) -> McpError {
    McpError::internal_error(message, None)
}

/// Rasterizes an SVG string to PNG bytes with resvg (pure Rust, no browser).
/// Scales the artwork so the longer side is ~1024px, on a white background.
fn rasterize_svg(svg: &str) -> Result<Vec<u8>, String> {
    use resvg::tiny_skia;
    use resvg::usvg;

    let mut opt = usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| e.to_string())?;

    let size = tree.size();
    let max_dim = size.width().max(size.height());
    let scale = if max_dim > 0.0 { (1024.0 / max_dim).min(2.0) } else { 1.0 };
    let pw = ((size.width() * scale).ceil() as u32).max(1);
    let ph = ((size.height() * scale).ceil() as u32).max(1);

    let mut pixmap = tiny_skia::Pixmap::new(pw, ph).ok_or("failed to allocate pixmap")?;
    pixmap.fill(tiny_skia::Color::WHITE);
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    pixmap.encode_png().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListArtifactsParams {
    /// The project (folder) to list artifacts from.
    project_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchParams {
    /// Matched against artifact titles and tags, case-insensitive.
    query: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetArtifactParams {
    project_id: String,
    artifact_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateProjectParams {
    name: String,
    /// Nest this project under an existing project's id. Omit for a top-level project.
    parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateArtifactParams {
    /// Omit to drop the artifact in the Inbox.
    project_id: Option<String>,
    title: String,
    /// One of: html, svg, markdown, jsx, tsx.
    artifact_type: String,
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateArtifactParams {
    project_id: String,
    artifact_id: String,
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListVersionsParams {
    project_id: String,
    artifact_id: String,
}

// The MCP spec requires each tool's outputSchema to have root type
// "object", so list-returning tools wrap their Vec in a named field
// rather than returning a bare JSON array.

#[derive(Debug, Serialize, JsonSchema)]
struct ProjectsResult {
    projects: Vec<Project>,
}

#[derive(Debug, Serialize, JsonSchema)]
struct ArtifactsResult {
    artifacts: Vec<ArtifactManifest>,
}

#[derive(Debug, Serialize, JsonSchema)]
struct VersionsResult {
    versions: Vec<ArtifactVersion>,
}

#[derive(Clone)]
pub struct SatchelMcpServer {
    app: AppHandle,
}

#[tool_router]
impl SatchelMcpServer {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    /// Best-effort notify the UI that the library changed. Never fails a tool
    /// call - a missing listener (e.g. window still loading) is fine.
    fn emit_change(&self, payload: serde_json::Value) {
        let _ = self.app.emit(LIBRARY_CHANGED_EVENT, payload);
    }

    #[tool(description = "List every project (folder) in the Satchel library. Projects can be \
        nested via parentId; a null parentId means top-level.")]
    async fn list_projects(&self) -> Result<Json<ProjectsResult>, McpError> {
        let state = self.app.state::<AppState>();
        commands::library::list_projects(state)
            .map(|projects| Json(ProjectsResult { projects }))
            .map_err(mcp_err)
    }

    #[tool(description = "Create a new project (folder) in the Satchel library.")]
    async fn create_project(
        &self,
        Parameters(CreateProjectParams { name, parent_id }): Parameters<CreateProjectParams>,
    ) -> Result<Json<Project>, McpError> {
        let state = self.app.state::<AppState>();
        let project =
            commands::library::create_project(state, name, None, parent_id).map_err(mcp_err)?;
        self.emit_change(serde_json::json!({
            "kind": "project-created",
            "projectId": project.id,
        }));
        Ok(Json(project))
    }

    #[tool(description = "List the artifacts inside a project.")]
    async fn list_artifacts(
        &self,
        Parameters(ListArtifactsParams { project_id }): Parameters<ListArtifactsParams>,
    ) -> Result<Json<ArtifactsResult>, McpError> {
        let state = self.app.state::<AppState>();
        commands::library::list_artifacts(state, project_id)
            .map(|artifacts| Json(ArtifactsResult { artifacts }))
            .map_err(mcp_err)
    }

    #[tool(description = "Search artifacts by title or tags across every project in the library.")]
    async fn search_artifacts(
        &self,
        Parameters(SearchParams { query }): Parameters<SearchParams>,
    ) -> Result<Json<ArtifactsResult>, McpError> {
        let state = self.app.state::<AppState>();
        commands::index::search_artifacts(state, query)
            .map(|artifacts| Json(ArtifactsResult { artifacts }))
            .map_err(mcp_err)
    }

    #[tool(description = "Get an artifact's source content. Text artifacts (html/svg/markdown/\
        jsx/tsx) come back as plain text; image/pdf artifacts come back as a data: URL.")]
    async fn get_artifact_source(
        &self,
        Parameters(GetArtifactParams { project_id, artifact_id }): Parameters<GetArtifactParams>,
    ) -> Result<String, McpError> {
        let state = self.app.state::<AppState>();
        commands::library::get_artifact_source(state, project_id, artifact_id).map_err(mcp_err)
    }

    #[tool(description = "Render an artifact to a PNG image so you can SEE what it currently \
        looks like - use this after editing to check your work visually, then edit again if \
        it's not right. Currently supports SVG artifacts (charts, diagrams, illustrations).")]
    async fn render_artifact(
        &self,
        Parameters(GetArtifactParams { project_id, artifact_id }): Parameters<GetArtifactParams>,
    ) -> Result<CallToolResult, McpError> {
        let state = self.app.state::<AppState>();
        let manifest =
            crate::library::read_manifest(&state.library_root, &project_id, &artifact_id)
                .map_err(|e| mcp_err(e.to_string()))?;
        if manifest.artifact_type != "svg" {
            return Err(mcp_err(format!(
                "Visual rendering currently supports SVG artifacts only (this one is '{}'). \
                 Read its source with get_artifact_source instead.",
                manifest.artifact_type
            )));
        }
        let source =
            commands::library::get_artifact_source(state, project_id, artifact_id).map_err(mcp_err)?;
        let png = rasterize_svg(&source).map_err(mcp_err)?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        Ok(CallToolResult::success(vec![ContentBlock::image(
            b64,
            "image/png".to_string(),
        )]))
    }

    #[tool(description = "Create a new artifact directly from content - the way to push \
        something you just generated straight into Satchel. artifact_type must be one of: \
        html, svg, markdown, jsx, tsx (binary types arrive via drag-and-drop import instead).")]
    async fn create_artifact(
        &self,
        Parameters(params): Parameters<CreateArtifactParams>,
    ) -> Result<Json<ArtifactManifest>, McpError> {
        let state = self.app.state::<AppState>();
        let manifest = commands::library::create_artifact_from_content(
            state,
            params.project_id,
            params.title,
            params.artifact_type,
            params.content,
        )
        .map_err(mcp_err)?;
        self.emit_change(serde_json::json!({
            "kind": "artifact-created",
            "projectId": manifest.project_id,
            "artifactId": manifest.id,
        }));
        Ok(Json(manifest))
    }

    #[tool(description = "Overwrite an existing artifact's content. The prior content is kept \
        in that artifact's version history and can be restored from within Satchel.")]
    async fn update_artifact(
        &self,
        Parameters(UpdateArtifactParams { project_id, artifact_id, content }): Parameters<
            UpdateArtifactParams,
        >,
    ) -> Result<String, McpError> {
        let state = self.app.state::<AppState>();
        let pid = project_id.clone();
        let aid = artifact_id.clone();
        commands::library::save_artifact_source(state, project_id, artifact_id, content)
            .map_err(mcp_err)?;
        self.emit_change(serde_json::json!({
            "kind": "artifact-updated",
            "projectId": pid,
            "artifactId": aid,
        }));
        Ok("Artifact updated.".to_string())
    }

    #[tool(description = "List an artifact's saved version history (most recent first).")]
    async fn list_artifact_versions(
        &self,
        Parameters(ListVersionsParams { project_id, artifact_id }): Parameters<ListVersionsParams>,
    ) -> Result<Json<VersionsResult>, McpError> {
        let state = self.app.state::<AppState>();
        commands::library::list_artifact_versions(state, project_id, artifact_id)
            .map(|versions| Json(VersionsResult { versions }))
            .map_err(mcp_err)
    }
}

#[tool_handler]
impl ServerHandler for SatchelMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Satchel is a local library of AI-generated artifacts (HTML, SVG, Markdown, JSX/TSX) \
             organized into projects. Use these tools to browse what's already saved, search by \
             title/tags, and push new artifacts in directly instead of asking the user to copy \
             them manually.",
        )
    }
}

/// Starts the MCP server in the background. Runs for the lifetime of the app;
/// there's no shutdown handle since it's meant to always be available while
/// Satchel is running, same as the rest of the local-only backend.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let service = StreamableHttpService::new(
            move || Ok(SatchelMcpServer::new(app.clone())),
            std::sync::Arc::new(LocalSessionManager::default()),
            StreamableHttpServerConfig::default(),
        );
        let router = axum::Router::new().nest_service("/mcp", service);

        let addr = format!("127.0.0.1:{MCP_PORT}");
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => listener,
            Err(e) => {
                tracing::error!("MCP server: failed to bind {addr}: {e}");
                return;
            }
        };
        tracing::info!("MCP server listening at http://{addr}/mcp");
        if let Err(e) = axum::serve(listener, router).await {
            tracing::error!("MCP server exited: {e}");
        }
    });
}
