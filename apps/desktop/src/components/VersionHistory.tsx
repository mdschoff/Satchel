import { useEffect, useState } from "react";
import type { ArtifactVersion } from "@satchel/artifact-core";
import { backend } from "../lib/tauri";
import { diffLines, type DiffLine } from "../lib/diffLines";

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
  const [diffId, setDiffId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);

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

  async function toggleDiff(timestamp: string) {
    if (diffId === timestamp) {
      setDiffId(null);
      setDiff(null);
      return;
    }
    setDiffId(timestamp);
    setDiff(null);
    // Compare this snapshot against the artifact's current source.
    const [old, current] = await Promise.all([
      backend.readArtifactVersion(projectId, artifactId, timestamp),
      backend.getArtifactSource(projectId, artifactId),
    ]);
    setDiff(diffLines(old, current));
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
              <div className="version-history-row">
                <div>
                  <div>{formatTimestamp(version.timestamp)}</div>
                  <div className="version-history-size">{formatSize(version.size)}</div>
                </div>
                <div className="version-history-actions">
                  <button
                    className="version-diff-toggle"
                    onClick={() => toggleDiff(version.timestamp)}
                  >
                    {diffId === version.timestamp ? "Hide" : "Diff"}
                  </button>
                  <button
                    disabled={restoringId !== null}
                    onClick={() => handleRestore(version.timestamp)}
                  >
                    {restoringId === version.timestamp ? "Restoring…" : "Restore"}
                  </button>
                </div>
              </div>
              {diffId === version.timestamp && (
                <div className="version-diff">
                  {diff === null ? (
                    <div className="version-history-empty">Comparing…</div>
                  ) : diff.every((l) => l.type === "same") ? (
                    <div className="version-history-empty">No differences from the current version.</div>
                  ) : (
                    <pre>
                      {diff.map((line, idx) => (
                        <div key={idx} className={`diff-line diff-${line.type}`}>
                          <span className="diff-gutter">
                            {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                          </span>
                          {line.text || " "}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
