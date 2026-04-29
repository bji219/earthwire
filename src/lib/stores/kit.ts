// src/lib/stores/kit.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { KitMeta, SlotMeta, DeviceMode } from '$lib/kit/types';

const STORAGE_KEY = 'earthwire-kit-v1';

const DEFAULT_KIT: KitMeta = {
  deviceMode: 'op1field',
  name: 'new kit',
  slots: Array(24).fill(null),
};

function loadMeta(): KitMeta {
  if (!browser) return { ...DEFAULT_KIT, slots: Array(24).fill(null) };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<KitMeta>;
      return {
        ...DEFAULT_KIT,
        ...parsed,
        slots: parsed.slots ?? Array(24).fill(null),
      };
    }
  } catch {}
  return { ...DEFAULT_KIT, slots: Array(24).fill(null) };
}

function saveMeta(meta: KitMeta) {
  if (!browser) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch {}
}

function createKitStore() {
  const { subscribe, update, set } = writable<KitMeta>(loadMeta());
  // In-memory AudioBuffer map — not persisted
  const buffers = new Map<number, AudioBuffer>();

  function applyUpdate(fn: (kit: KitMeta) => KitMeta) {
    update(kit => {
      const next = fn(kit);
      saveMeta(next);
      return next;
    });
  }

  return {
    subscribe,

    setSlot(index: number, meta: SlotMeta, buffer: AudioBuffer) {
      buffers.set(index, buffer);
      applyUpdate(kit => {
        const slots = [...kit.slots];
        slots[index] = meta;
        return { ...kit, slots };
      });
    },

    updateSlotTrim(index: number, trimStart: number, trimEnd: number) {
      applyUpdate(kit => {
        const slots = [...kit.slots];
        const existing = slots[index];
        if (existing) slots[index] = { ...existing, trimStart, trimEnd };
        return { ...kit, slots };
      });
    },

    clearSlot(index: number) {
      buffers.delete(index);
      applyUpdate(kit => {
        const slots = [...kit.slots];
        slots[index] = null;
        return { ...kit, slots };
      });
    },

    swapSlots(a: number, b: number) {
      const bufA = buffers.get(a);
      const bufB = buffers.get(b);
      if (bufA !== undefined) buffers.set(b, bufA); else buffers.delete(b);
      if (bufB !== undefined) buffers.set(a, bufB); else buffers.delete(a);
      applyUpdate(kit => {
        const slots = [...kit.slots] as KitMeta['slots'];
        [slots[a], slots[b]] = [slots[b], slots[a]];
        return { ...kit, slots };
      });
    },

    getBuffer(index: number): AudioBuffer | undefined {
      return buffers.get(index);
    },

    setBuffer(index: number, buffer: AudioBuffer) {
      buffers.set(index, buffer);
    },

    setDeviceMode(mode: DeviceMode) {
      applyUpdate(kit => ({ ...kit, deviceMode: mode }));
    },

    setName(name: string) {
      applyUpdate(kit => ({ ...kit, name }));
    },

    reset() {
      buffers.clear();
      const fresh = { ...DEFAULT_KIT, slots: Array(24).fill(null) };
      set(fresh);
      saveMeta(fresh);
    },
  };
}

export const kit = createKitStore();
