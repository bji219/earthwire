import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  EXPORT_COUNT_STORAGE_KEY,
  FREE_EXPORT_LIMIT,
  FREE_UPLOAD_LIMIT,
  LICENSE_STORAGE_KEY,
} from '$lib/license/limits.js';
import type { VerifyFailure } from '$lib/license/sign.js';

export type UnlockReason = 'export' | 'trim' | 'upload' | 'manual';

export interface LicenseState {
  status: 'locked' | 'unlocked';
  batch: string | null;
  exportCount: number;
}

function readStored(): LicenseState {
  const blank: LicenseState = { status: 'locked', batch: null, exportCount: 0 };
  if (!browser) return blank;

  const exportCount = Number(localStorage.getItem(EXPORT_COUNT_STORAGE_KEY)) || 0;

  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return { ...blank, exportCount };
    const parsed = JSON.parse(raw) as { batch?: unknown };
    if (typeof parsed?.batch !== 'string') return { ...blank, exportCount };
    return { status: 'unlocked', batch: parsed.batch, exportCount };
  } catch {
    return { ...blank, exportCount };
  }
}

const store = writable<LicenseState>(readStored());

export const license = { subscribe: store.subscribe };

export const isUnlocked = derived(store, $l => $l.status === 'unlocked');

export const exportsRemaining = derived(store, $l =>
  $l.status === 'unlocked' ? Infinity : Math.max(0, FREE_EXPORT_LIMIT - $l.exportCount),
);

export const uploadLimit = derived(store, $l =>
  $l.status === 'unlocked' ? Infinity : FREE_UPLOAD_LIMIT,
);

export function canExport(): boolean {
  return get(exportsRemaining) > 0;
}

export function recordExport(): void {
  store.update(state => {
    const exportCount = state.exportCount + 1;
    if (browser) localStorage.setItem(EXPORT_COUNT_STORAGE_KEY, String(exportCount));
    return { ...state, exportCount };
  });
}

export type ActivateResult = { ok: true } | { ok: false; reason: VerifyFailure | 'throttled' | 'network' };

export async function activate(key: string): Promise<ActivateResult> {
  let payload: { ok?: boolean; batch?: string; reason?: string };
  try {
    const res = await fetch('/api/license/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    payload = await res.json();
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!payload?.ok || typeof payload.batch !== 'string') {
    const reason = payload?.reason;
    const known = reason === 'malformed' || reason === 'invalid' || reason === 'revoked' || reason === 'throttled';
    return { ok: false, reason: known ? reason : 'network' };
  }

  const batch = payload.batch;
  if (browser) localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ batch, key }));
  store.update(state => ({ ...state, status: 'unlocked', batch }));
  return { ok: true };
}

export function deactivate(): void {
  if (browser) localStorage.removeItem(LICENSE_STORAGE_KEY);
  store.update(state => ({ ...state, status: 'locked', batch: null }));
}

export const unlockPrompt = writable<{ open: boolean; reason: UnlockReason }>({
  open: false,
  reason: 'manual',
});

export function openUnlock(reason: UnlockReason = 'manual'): void {
  unlockPrompt.set({ open: true, reason });
}

export function closeUnlock(): void {
  unlockPrompt.update(p => ({ ...p, open: false }));
}
