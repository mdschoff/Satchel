import { create } from "zustand";

type View = "library" | "settings";

interface UiState {
  view: View;
  setView: (view: View) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Bumped to ask the sidebar to open its "new project" form (⌘N / menu). */
  newProjectNonce: number;
  requestNewProject: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "library",
  setView: (view) => set({ view }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  newProjectNonce: 0,
  requestNewProject: () =>
    set((s) => ({ sidebarCollapsed: false, newProjectNonce: s.newProjectNonce + 1 })),
}));
