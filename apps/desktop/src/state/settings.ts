import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface SettingsState {
  activeProviderId: string;
  providers: Record<string, ProviderSettings>;
  setActiveProvider: (id: string) => void;
  updateProviderSettings: (id: string, settings: ProviderSettings) => void;
}

/**
 * Persisted to localStorage for now - fine for a single-user local-first app,
 * but API keys deserve OS-keychain storage before this ships broadly.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      activeProviderId: "claude",
      providers: {},
      setActiveProvider(id) {
        set({ activeProviderId: id });
      },
      updateProviderSettings(id, settings) {
        set({ providers: { ...get().providers, [id]: { ...get().providers[id], ...settings } } });
      },
    }),
    { name: "satchel-settings" },
  ),
);
