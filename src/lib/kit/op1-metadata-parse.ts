// Inverse of buildOp1Metadata — extract a kit description from the APPL
// payload of an OP-1 / OP-1 Field drum kit AIFC file.
//
// The forward maps live in op1-metadata.ts (PLAYMODE_CODES, REVERSE_CODES,
// OP1_MAX, DEVICE_MAX_SECONDS). We don't invert them at runtime here because
// (gate, revgate) and (gravity-like codes) can have collisions; the
// decodePlayMode function handles disambiguation via the reverse field.

import { OP1_MAX, DEVICE_MAX_SECONDS } from './op1-metadata';
import type { DeviceMode, SlotPlayMode } from './types';

export interface IngestedSlot {
  playMode: SlotPlayMode;
  startFrame: number; // in source sample-rate frames
  endFrame: number;
}

export interface IngestedKit {
  name: string;
  deviceMode: DeviceMode;
  slots: (IngestedSlot | null)[]; // always 24 entries
}

const OP1_SIGNATURE = 'op-1';
const EMPTY_SLOT_MIN_SECONDS = 0.05; // <50ms region → treat as empty placeholder

// (playmode, reverse) → SlotPlayMode. The forward map has a collision at
// playmode=4096 (used by both 'gate' forward and 'revgate'); we resolve it by
// inspecting the reverse value (12000=forward, 18432=reverse).
function decodePlayMode(pm: number, rev: number): SlotPlayMode {
  if (rev === 18432) {
    if (pm === 12288) return 'revoneshot';
    if (pm === 4096)  return 'revgate';
  }
  if (pm === 8192)  return 'oneshot';
  if (pm === 4096)  return 'gate';
  if (pm === 28672) return 'loop';
  if (pm === 20480) return 'gravity';
  // Unknown code — fall back to oneshot rather than refusing the entire kit.
  return 'oneshot';
}

function readApplJson(applData: Uint8Array): any {
  if (applData.length < 4) throw new Error('APPL chunk too small');
  const signature = String.fromCharCode(
    applData[0], applData[1], applData[2], applData[3]
  );
  if (signature !== OP1_SIGNATURE) {
    throw new Error('No OP-1 metadata found — this is not a drum kit AIFF');
  }
  // Find first NUL or run to end, then trim trailing spaces. Our exporter
  // pads with 0x20 (space) to 4096 bytes; some other writers may use NUL.
  const jsonBytes = applData.subarray(4);
  let end = jsonBytes.length;
  for (let i = 0; i < jsonBytes.length; i++) {
    if (jsonBytes[i] === 0x00) { end = i; break; }
  }
  let text = new TextDecoder('utf-8').decode(jsonBytes.subarray(0, end));
  text = text.replace(/[\s ]+$/, ''); // trim trailing whitespace incl. spaces
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Corrupt APPL metadata: ${e?.message ?? 'JSON parse failed'}`);
  }
}

export function parseOp1Appl(applData: Uint8Array, sampleRate: number): IngestedKit {
  const meta = readApplJson(applData);

  const drumVersion = meta.drum_version;
  let deviceMode: DeviceMode;
  if (drumVersion === 1) deviceMode = 'op1';
  else if (drumVersion === 2) deviceMode = 'op1field';
  else throw new Error(`Unrecognized drum_version: ${drumVersion}`);

  const starts: number[] = Array.isArray(meta.start) ? meta.start : [];
  const ends:   number[] = Array.isArray(meta.end)   ? meta.end   : [];
  const pms:    number[] = Array.isArray(meta.playmode) ? meta.playmode : [];
  const revs:   number[] = Array.isArray(meta.reverse)  ? meta.reverse  : [];

  if (starts.length !== 24 || ends.length !== 24) {
    throw new Error('OP-1 metadata missing or wrong-length start/end arrays');
  }

  const scale = OP1_MAX / (sampleRate * DEVICE_MAX_SECONDS[deviceMode]);
  const emptyFrameThreshold = Math.floor(sampleRate * EMPTY_SLOT_MIN_SECONDS);

  const slots: (IngestedSlot | null)[] = [];
  for (let i = 0; i < 24; i++) {
    const startFrame = Math.round(starts[i] / scale);
    const endFrame   = Math.round(ends[i] / scale);
    const durationFrames = endFrame - startFrame;
    if (durationFrames < emptyFrameThreshold) {
      slots.push(null);
      continue;
    }
    const playMode = decodePlayMode(pms[i] ?? 0, revs[i] ?? 0);
    slots.push({ playMode, startFrame, endFrame });
  }

  const name = typeof meta.name === 'string' ? meta.name : '';

  return { name, deviceMode, slots };
}

// Exposed for tests
export const _internals = { decodePlayMode };
