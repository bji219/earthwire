import { writable } from 'svelte/store';

export interface DragPayload {
  name: string;
  sourceType: 'local' | 'freesound' | 'xeno-canto';
  remoteSrc?: string;
  buffer: AudioBuffer;
}

export const dragPayload = writable<DragPayload | null>(null);
