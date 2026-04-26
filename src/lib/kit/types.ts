// src/lib/kit/types.ts

export type DeviceMode = 'op1' | 'op1field';
export type SourceType = 'local' | 'freesound' | 'xeno-canto';

export interface SlotMeta {
  name: string;
  sourceType: SourceType;
  remoteSrc?: string;   // URL to re-fetch for remote sources
  localId?: string;     // IndexedDB key for local files
  trimStart: number;    // seconds
  trimEnd: number;      // seconds (= full duration if untrimmed)
  fullDuration: number; // original full length in seconds
  color: string;        // assigned palette color
}

export interface KitMeta {
  deviceMode: DeviceMode;
  name: string;
  slots: (SlotMeta | null)[];  // always 24 entries
}

/** Max total stitched duration per device mode (seconds) */
export const DEVICE_LIMITS: Record<DeviceMode, number> = {
  op1: 12,
  op1field: 20,
};

/** Stereo for op1field, mono for op1 */
export const DEVICE_CHANNELS: Record<DeviceMode, number> = {
  op1: 1,
  op1field: 2,
};

/** Bit depth per device */
export const DEVICE_BIT_DEPTH: Record<DeviceMode, number> = {
  op1: 16,
  op1field: 24,
};

/** drum_version per device */
export const DEVICE_DRUM_VERSION: Record<DeviceMode, number> = {
  op1: 1,
  op1field: 2,
};

/** 24 earthy colors, one per slot index */
export const SLOT_COLORS = [
  '#c0552a', '#2d4a6e', '#9a7c4a', '#5a7a8a',
  '#c06030', '#4a7c59', '#7a4a6e', '#6e6e2d',
  '#2d6e6e', '#6e2d2d', '#4a6e2d', '#2d2d6e',
  '#8a6a3a', '#3a6a8a', '#6a3a8a', '#8a3a6a',
  '#3a8a6a', '#8a8a3a', '#3a3a8a', '#8a3a3a',
  '#6a8a3a', '#3a8a8a', '#8a6a6a', '#6a6a8a',
];

/** Note name for each of the 24 drum kit slots (F4 through E6) */
export const SLOT_NOTES = [
  'F','F#','G','G#','A','A#','B',
  'C','C#','D','D#','E',
  'F','F#','G','G#','A','A#','B',
  'C','C#','D','D#','E',
];

/** Format seconds as SS.CS (e.g. 1.4 → "01.40") */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const cs = Math.round((seconds - s) * 100);
  return `${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
