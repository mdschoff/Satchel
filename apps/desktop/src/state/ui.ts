import { create } from "zustand";

type View = "library" | "settings";

interface UiState {
  view: View;
  setView: (view: View) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "library",
  setView: (view) => set({ view }),
}));
