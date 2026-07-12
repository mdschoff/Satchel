import { useEffect, useState } from "react";
import type { ArtifactVersion } from "@satchel/artifact-core";
import { backend } from "../lib/tauri";

interface VersionHistoryProps {
  projectId: string;
  artifactId: string;
  onRestored: () => void;
  onClose: () => void;
}

function formatTimestamp(timestamp: string): string {
  // "20260710T192530123Z" -> a real Date
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(timestamp);
  if (!match) return timestamp;
  const [, y, mo, d, h, mi, s, ms] = match;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms));
  return date.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function VersionHistory({ projectId, artifactId, onRestored, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    backend.listArtifactVersions(projectId, artifactId).then((result) => {
      if (!cancelled) {
        setVersions(result);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, artifactId]);

  async function handleRestore(timestamp: string) {
    setRestoringId(timestamp);
    await backend.restoreArtifactVersion(projectId, artifactId, timestamp);
    setRestoringId(null);
    onRestored();
    onClose();
  }

  return (
    <div className="version-history">
      <div className="version-history-header">
        <h3>Version history</h3>
        <button onClick={onClose}>Close</button>
      </div>
      {isLoading ? (
        <div className="version-history-empty">Loading…</div>
      ) : versions.length === 0 ? (
        <div className="version-history-empty">
          No earlier versions yet - saves are snapshotted here going forward.
        </div>
      ) : (
        <ul className="version-history-list">
          {versions.map((version) => (
            <li key={version.timestamp} className="version-history-item">
              <div>
                <div>{formatTimestamp(version.timestamp)}</div>
                <div className="version-history-size">{formatSize(version.size)}</div>
              </div>
              <button
                disabled={restoringId !== null}
                onClick={() => handleRestore(version.timestamp)}
              >
                {restoringId === version.timestamp ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
