import { DEVICE_DRUM_VERSION, type DeviceMode } from './types';

interface SlotTiming {
  trimDuration: number; // seconds
}

interface MetadataOptions {
  kitName: string;
  deviceMode: DeviceMode;
  slots: (SlotTiming | null)[];  // 24 entries
  sampleRate: number;
}

/**
 * Build OP-1 APPL JSON string (null-terminated, padded to even byte length).
 * The JSON encodes per-slot start/end frame positions for the stitched AIFF.
 */
export function buildOp1Metadata(opts: MetadataOptions): string {
  const { kitName, deviceMode, slots, sampleRate } = opts;

  const start: number[] = [];
  const end: number[] = [];
  let cursor = 0;

  for (const slot of slots) {
    start.push(cursor);
    if (slot) {
      const frames = Math.round(slot.trimDuration * sampleRate);
      cursor += frames;
    }
    end.push(cursor);
  }

  const meta = {
    drum_version: DEVICE_DRUM_VERSION[deviceMode],
    type: 'drum',
    name: kitName,
    octave: 0,
    pitch:    Array(24).fill(0),
    start,
    end,
    volume:   Array(24).fill(8192),
    pan:      Array(24).fill(0),
    playmode: Array(24).fill('OneShot'),
    reverse:  Array(24).fill(0),
    fullLength: cursor,
  };

  const json = JSON.stringify(meta) + '\0';
  // Pad to even byte length
  const bytes = new TextEncoder().encode(json);
  if (bytes.length % 2 !== 0) return json + '\0';
  return json;
}
