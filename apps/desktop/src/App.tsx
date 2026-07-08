import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useLibraryStore } from "./state/library";
import { Sidebar } from "./components/Sidebar";
import { ProjectGrid } from "./components/ProjectGrid";
import { ArtifactView } from "./components/ArtifactView";
import "./App.css";

export default function App() {
  const loadProjects = useLibraryStore((s) => s.loadProjects);
  const importPaths = useLibraryStore((s) => s.importPaths);
  const selectedArtifactId = useLibraryStore((s) => s.selectedArtifactId);
  const error = useLibraryStore((s) => s.error);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        importPaths(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [importPaths]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => useLibraryStore.setState({ error: null })}>Dismiss</button>
          </div>
        )}
        {selectedArtifactId ? <ArtifactView /> : <ProjectGrid />}
      </main>
    </div>
  );
}
