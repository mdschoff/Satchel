import { create } from "zustand";

/**
 * Cross-component state for the artifact drag-and-drop. We can't use native
 * HTML5 drag-and-drop here - Tauri's OS-level file-drop handler intercepts drag
 * sessions at the window level before the webview's drag events fire - so the
 * grid drives a pointer-based drag and publishes it here for the sidebar to
 * read (which project is currently under the cursor as a drop target).
 */
interface DndState {
  /** Artifact ids currently being dragged; empty when no drag is active. */
  draggingIds: string[];
  /** Project id under the cursor right now, or null. */
  overProjectId: string | null;
  setDragging: (ids: string[]) => void;
  setOver: (projectId: string | null) => void;
  reset: () => void;
}

export const useDndStore = create<DndState>((set) => ({
  draggingIds: [],
  overProjectId: null,
  setDragging: (draggingIds) => set({ draggingIds }),
  setOver: (overProjectId) => set({ overProjectId }),
  reset: () => set({ draggingIds: [], overProjectId: null }),
}));
