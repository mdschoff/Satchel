import { useEffect, useRef, useState } from "react";
import type { ArtifactManifest } from "@satchel/artifact-core";
import { backend } from "../lib/tauri";
import { getRenderer } from "../renderers/registry";

interface ArtifactThumbnailProps {
  artifact: ArtifactManifest;
  projectId: string;
}

/**
 * A live, non-interactive preview of an artifact for the project grid. Reuses
 * the same renderer pipeline the full ArtifactView uses, dropped into a
 * sandboxed iframe that's zoomed out 4x (width:400% + scale(0.25)) so the
 * whole artifact shows regardless of the card's pixel width. Rendering is
 * deferred until the card scrolls into view so a large library doesn't compile
 * every thumbnail up front.
 */
export function ArtifactThumbnail({ artifact, projectId }: ArtifactThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      try {
        const source = await backend.getArtifactSource(projectId, artifact.id);
        const renderer = getRenderer(artifact.type);
        if (!renderer) throw new Error("no renderer");
        let result;
        if (renderer.needsCompile && renderer.compile) {
          const compiled = await renderer.compile(source);
          if (!compiled.ok || !compiled.output) throw new Error("compile failed");
          result = await renderer.render(compiled.output);
        } else {
          result = await renderer.render(source);
        }
        if (!cancelled) setHtml(result.html);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, projectId, artifact.id, artifact.type]);

  return (
    <div className="artifact-card-thumb" ref={containerRef} aria-hidden="true">
      {html && !failed ? (
        <>
          <iframe
            className="artifact-card-thumb-frame"
            sandbox="allow-scripts"
            srcDoc={html}
            title=""
            tabIndex={-1}
          />
          {/* Transparent lid: right-clicking an iframe otherwise triggers
              WebKit's own frame context menu, and pointer-events:none on the
              iframe doesn't suppress it. This overlay catches the events so
              they bubble to the card (open on click, our menu on right-click). */}
          <div className="artifact-card-thumb-lid" />
        </>
      ) : (
        <div className={`artifact-card-thumb-fallback type-${artifact.type}`}>
          {failed ? "preview unavailable" : ""}
        </div>
      )}
    </div>
  );
}
