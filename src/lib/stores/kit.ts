// src/lib/stores/kit.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  PLAY_MODE_CYCLE, PLAY_MODE_DEFAULT,
  type KitMeta, type SlotMeta, type DeviceMode, type SlotPlayMode,
} from '$lib/kit/types';

const STORAGE_KEY = 'earthwire-kit-v1';
const PCM_DB_NAME = 'earthwire-kit-pcm';
const PCM_STORE = 'slots';
const PCM_DB_VER = 1;

const DEFAULT_KIT: KitMeta = {
  deviceMode: 'op1field',
  name: '',
  slots: Array(24).fill(null),
};

function loadMeta(): KitMeta {
  if (!browser) return { ...DEFAULT_KIT, slots: Array(24).fill(null) };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<KitMeta>;
      const name = parsed.name === 'new kit' ? '' : (parsed.name ?? '');
      const rawSlots = parsed.slots ?? Array(24).fill(null);
      // Migrate old playMode values: loop→gravity, gate→loop, reverse→revgate
      const migrateMode = (m: string | undefined): SlotPlayMode => {
        if (m === 'loop')    return 'gravity';
        if (m === 'gate')    return 'loop';
        if (m === 'reverse') return 'revgate';
        return (m as SlotPlayMode) ?? PLAY_MODE_DEFAULT;
      };
      const slots = rawSlots.map((s: any) =>
        s ? { ...s, playMode: migrateMode(s.playMode) } as SlotMeta : null
      );
      return { ...DEFAULT_KIT, ...parsed, name, slots };
    }
  } catch {}
  return { ...DEFAULT_KIT, slots: Array(24).fill(null) };
}

function saveMeta(meta: KitMeta) {
  if (!browser) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch {}
}

type PcmSnapshot = { sr: number; nch: number; ch: Float32Array[] };
type PcmRecord = { index: number; sr: number; nch: number; ch: Float32Array[] };

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

function openPcmDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PCM_DB_NAME, PCM_DB_VER);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(PCM_STORE, { keyPath: 'index' });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function savePcm(index: number, snap: PcmSnapshot): Promise<void> {
  const db = await openPcmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PCM_STORE, 'readwrite');
    const rec: PcmRecord = { index, sr: snap.sr, nch: snap.nch, ch: snap.ch };
    tx.objectStore(PCM_STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function loadAllPcm(): Promise<Map<number, PcmSnapshot>> {
  const db = await openPcmDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PCM_STORE, 'readonly');
    const req = tx.objectStore(PCM_STORE).getAll();
    req.onsuccess = () => {
      const out = new Map<number, PcmSnapshot>();
      for (const rec of req.result as PcmRecord[]) {
        out.set(rec.index, { sr: rec.sr, nch: rec.nch, ch: rec.ch });
      }
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

async function deletePcm(index: number): Promise<void> {
  const db = await openPcmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PCM_STORE, 'readwrite');
    tx.objectStore(PCM_STORE).delete(index);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function clearAllPcm(): Promise<void> {
  const db = await openPcmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PCM_STORE, 'readwrite');
    tx.objectStore(PCM_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

const warnPersist = (err: unknown) => console.warn('kit pcm persist failed', err);

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

  if (browser) {
    loadAllPcm().then(loaded => {
      for (const [i, snap] of loaded) {
        if (!pcm.has(i)) pcm.set(i, snap);
      }
      // Trigger reactive refresh so kit.getBuffer(i) re-evaluates in consumers.
      // Also clear ghost slots: metadata present but PCM missing means the
      // user reloaded before persistence landed (or storage was wiped) —
      // showing an unplayable row is worse than showing none.
      update(kit => {
        let changed = false;
        const slots = kit.slots.map((s, i) => {
          if (s && !pcm.has(i)) { changed = true; return null; }
          return s;
        });
        const next = changed ? { ...kit, slots } : { ...kit };
        if (changed) saveMeta(next);
        return next;
      });
    }).catch(err => {
      console.warn('kit pcm hydrate failed', err);
      update(kit => {
        const next = { ...kit, slots: Array(24).fill(null) };
        saveMeta(next);
        return next;
      });
    });
  }

  return {
    subscribe,

    setSlot(index: number, meta: SlotMeta, buffer: AudioBuffer) {
      const snap = snapshotBuffer(buffer);
      pcm.set(index, snap);
      if (browser) savePcm(index, snap).catch(warnPersist);
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

    setSlotPlayMode(index: number, mode: SlotPlayMode) {
      applyUpdate(kit => {
        const slots = [...kit.slots];
        const existing = slots[index];
        if (existing) slots[index] = { ...existing, playMode: mode };
        return { ...kit, slots };
      });
    },

    cyclePlayMode(index: number) {
      applyUpdate(kit => {
        const slots = [...kit.slots];
        const existing = slots[index];
        if (existing) {
          const i = PLAY_MODE_CYCLE.indexOf(existing.playMode);
          const next = PLAY_MODE_CYCLE[(i + 1) % PLAY_MODE_CYCLE.length];
          slots[index] = { ...existing, playMode: next };
        }
        return { ...kit, slots };
      });
    },

    clearSlot(index: number) {
      pcm.delete(index);
      if (browser) deletePcm(index).catch(warnPersist);
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
      if (browser) {
        const writeA = pcm.get(a);
        const writeB = pcm.get(b);
        (writeA ? savePcm(a, writeA) : deletePcm(a)).catch(warnPersist);
        (writeB ? savePcm(b, writeB) : deletePcm(b)).catch(warnPersist);
      }
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
      const snap = snapshotBuffer(buffer);
      pcm.set(index, snap);
      if (browser) savePcm(index, snap).catch(warnPersist);
    },

    setDeviceMode(mode: DeviceMode) {
      applyUpdate(kit => ({ ...kit, deviceMode: mode }));
    },

    setName(name: string) {
      applyUpdate(kit => ({ ...kit, name }));
    },

    reset() {
      pcm.clear();
      if (browser) clearAllPcm().catch(warnPersist);
      const fresh = { ...DEFAULT_KIT, slots: Array(24).fill(null) };
      set(fresh);
      saveMeta(fresh);
    },
  };
}

export const kit = createKitStore();
