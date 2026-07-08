import { create } from "zustand";
import { backend } from "../lib/tauri";

interface ApiKeyState {
  keys: Record<string, string>;
  loaded: Record<string, boolean>;
  loadKey: (providerId: string) => Promise<void>;
  setKey: (providerId: string, value: string) => Promise<void>;
}

/**
 * Deliberately not persisted via zustand/persist (that goes to localStorage).
 * Keys live in the OS keychain via Rust commands; this store is just an
 * in-memory cache of whatever's been loaded from there this session.
 */
export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  keys: {},
  loaded: {},

  async loadKey(providerId) {
    if (get().loaded[providerId]) return;
    const value = await backend.getSecret(providerId);
    set((s) => ({
      keys: { ...s.keys, [providerId]: value ?? "" },
      loaded: { ...s.loaded, [providerId]: true },
    }));
  },

  async setKey(providerId, value) {
    await backend.saveSecret(providerId, value);
    set((s) => ({ keys: { ...s.keys, [providerId]: value } }));
  },
}));
