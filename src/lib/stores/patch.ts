import { writable, get } from 'svelte/store';
import type { PatchConfig, ChannelConfig } from '$lib/engine/types.js';

const DEFAULT_PATCH: PatchConfig = {
  id: 'untitled',
  name: 'Untitled Patch',
  specVersion: '0.1.0',
  bpm: 120,
  channels: []
};

const STORAGE_KEY = 'earthwire-patch';

function loadFromStorage(): PatchConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_PATCH;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // corrupted data, use default
  }
  return DEFAULT_PATCH;
}

function createPatchStore() {
  const { subscribe, set, update } = writable<PatchConfig>(loadFromStorage());

  // Auto-save on changes
  subscribe((patch) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
    }
  });

  return {
    subscribe,
    set,
    addChannel(channel: ChannelConfig) {
      update((p) => ({ ...p, channels: [...p.channels, channel] }));
    },
    removeChannel(index: number) {
      update((p) => ({
        ...p,
        channels: p.channels.filter((_, i) => i !== index)
      }));
    },
    updateChannel(index: number, channel: ChannelConfig) {
      update((p) => ({
        ...p,
        channels: p.channels.map((c, i) => (i === index ? channel : c))
      }));
    },
    setBpm(bpm: number) {
      update((p) => ({ ...p, bpm }));
    },
    exportJson(): string {
      return JSON.stringify(get({ subscribe }), null, 2);
    },
    importJson(json: string) {
      try {
        const parsed = JSON.parse(json) as PatchConfig;
        if (parsed.specVersion && parsed.channels) {
          set(parsed);
          return true;
        }
      } catch {
        // invalid JSON
      }
      return false;
    },
    reset() {
      set(DEFAULT_PATCH);
    }
  };
}

export const patch = createPatchStore();
