import { writable, derived } from 'svelte/store';

// @ts-ignore - MIDIAccess is a browser type that may not be in all TS environments
export const midiAccess = writable<MIDIAccess | null>(null);
export const selectedPortId = writable<string | null>(null);

export const outputPorts = derived(midiAccess, ($access) => {
  if (!$access) return [];
  return Array.from($access.outputs.values());
});

export async function initMidi(): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false;
  try {
    const access = await navigator.requestMIDIAccess();
    midiAccess.set(access);
    return true;
  } catch {
    return false;
  }
}
