import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProviderSettings {
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
 * Non-secret settings only (active provider, base URL, model) - persisted to
 * localStorage. API keys live in the OS keychain instead, via state/apiKeys.ts.
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
