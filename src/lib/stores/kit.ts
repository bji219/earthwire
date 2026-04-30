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

type PcmSnapshot = { sr: number; nch: number; ch: Float32Array[] };

function snapshotBuffer(buffer: AudioBuffer): PcmSnapshot {
  return {
    sr: buffer.sampleRate,
    nch: buffer.numberOfChannels,
    ch: Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      new Float32Array(buffer.getChannelData(i))
    ),
  };
}

function buildBuffer(snap: PcmSnapshot): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: snap.nch, length: snap.ch[0].length, sampleRate: snap.sr });
  snap.ch.forEach((data, i) => buf.getChannelData(i).set(data));
  return buf;
}

function createKitStore() {
  const { subscribe, update, set } = writable<KitMeta>(loadMeta());
  // Store raw PCM snapshots — AudioBuffers handed to Web Audio get recycled after playback
  const pcm = new Map<number, PcmSnapshot>();

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
      pcm.set(index, snapshotBuffer(buffer));
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
      pcm.delete(index);
      applyUpdate(kit => {
        const slots = [...kit.slots];
        slots[index] = null;
        return { ...kit, slots };
      });
    },

    swapSlots(a: number, b: number) {
      const bufA = pcm.get(a);
      const bufB = pcm.get(b);
      if (bufA !== undefined) pcm.set(b, bufA); else pcm.delete(b);
      if (bufB !== undefined) pcm.set(a, bufB); else pcm.delete(a);
      applyUpdate(kit => {
        const slots = [...kit.slots] as KitMeta['slots'];
        [slots[a], slots[b]] = [slots[b], slots[a]];
        return { ...kit, slots };
      });
    },

    getBuffer(index: number): AudioBuffer | undefined {
      const snap = pcm.get(index);
      return snap ? buildBuffer(snap) : undefined;
    },

    setBuffer(index: number, buffer: AudioBuffer) {
      pcm.set(index, snapshotBuffer(buffer));
    },

    setDeviceMode(mode: DeviceMode) {
      applyUpdate(kit => ({ ...kit, deviceMode: mode }));
    },

    setName(name: string) {
      applyUpdate(kit => ({ ...kit, name }));
    },

    reset() {
      pcm.clear();
      const fresh = { ...DEFAULT_KIT, slots: Array(24).fill(null) };
      set(fresh);
      saveMeta(fresh);
    },
  };
}

export const kit = createKitStore();
