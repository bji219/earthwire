import { DEVICE_DRUM_VERSION, type DeviceMode, type SlotPlayMode } from './types';

interface SlotTiming {
  trimDuration: number; // seconds
  playMode?: SlotPlayMode; // defaults to 'oneshot' (current default in firmware)
}

interface MetadataOptions {
  kitName: string;
  deviceMode: DeviceMode;
  slots: (SlotTiming | null)[];  // 24 entries
  sampleRate: number;
}

// OP-1 APPL JSON encodes per-slot playback as two orthogonal integer arrays.
// Codes confirmed via operator1/op1 wiki, schollz/teoperator, padenot/libop1,
// and joseph-holland/op-patchstudio. The `12000` forward default is preserved
// from this codebase's working baseline (matched against 808.aif).
export const PLAYMODE_CODES: Record<SlotPlayMode, number> = {
  oneshot:    8192,   // confirmed
  gate:       4096,   // confirmed
  loop:       28672,  // confirmed: 0x7000, extracted from OP-1 Field kit binary
  gravity:    20480,  // confirmed
  revoneshot: 12288,  // confirmed
  revgate:    4096,   // confirmed
};
export const REVERSE_CODES: Record<SlotPlayMode, number> = {
  oneshot:    12000,
  gate:       12000,
  loop:       12000,
  gravity:    12000,
  revoneshot: 18432,
  revgate:    18432,
};

// OP-1 / OP-1 Field encodes sample positions as scaled fixed-point integers.
// The entire max recording window maps to 0x7FFFFFFE (2,147,483,646).
// scale = 0x7FFFFFFE / (sampleRate × maxSeconds)
// Confirmed by DigiChain source (resources.js) and op-forums reverse-engineering.
export const DEVICE_MAX_SECONDS: Record<DeviceMode, number> = { op1: 12, op1field: 20 };
export const OP1_MAX = 0x7ffffffe; // 2,147,483,646

// The OP-1 Field firmware reads a fixed 4096-byte block from the APPL chunk
// starting after the 4-byte 'op-1' signature. If the block is shorter the
// firmware reads into SSND binary data, fails to parse JSON, and auto-slices.
// Pad JSON with spaces to exactly 4096 bytes — no null terminator.
const APPL_CONTENT_SIZE = 4096;

/**
 * Build OP-1 APPL JSON block: exactly 4096 bytes, space-padded after the JSON.
 */
export function buildOp1Metadata(opts: MetadataOptions): string {
  const { kitName, deviceMode, slots, sampleRate } = opts;

  const scale = OP1_MAX / (sampleRate * DEVICE_MAX_SECONDS[deviceMode]);

  // OP-1 Field firmware rejects kits with any zero-duration slot — it falls
  // back to auto-slicing the audio. KitBuilder appends `numEmpty` frames of
  // silence so each empty slot here can claim a unique 1-frame region.
  let filledFrames = 0;
  for (const s of slots) {
    if (s) filledFrames += Math.round(s.trimDuration * sampleRate);
  }

  // Math.round() accumulation across many slots can push filledFrames 1 frame
  // over the per-device budget, causing end[last_empty] > OP1_MAX. Clamp so
  // (safeFilledFrames + emptyCount) * scale never exceeds OP1_MAX.
  const emptyCount = slots.filter(s => !s).length;
  const maxTotalFrames = sampleRate * DEVICE_MAX_SECONDS[deviceMode];
  const safeFilledFrames = Math.min(filledFrames, maxTotalFrames - emptyCount);

  const start: number[] = [];
  const end:   number[] = [];
  const playmode: number[] = [];
  const reverse:  number[] = [];
  let fillCursor = 0;
  let emptyIdx   = 0;

  for (const slot of slots) {
    if (slot) {
      const slotStart = fillCursor;
      fillCursor += Math.round(slot.trimDuration * sampleRate);
      start.push(Math.floor(slotStart * scale));
      end.push(Math.floor(fillCursor * scale));
      const mode = slot.playMode ?? 'oneshot';
      playmode.push(PLAYMODE_CODES[mode]);
      reverse.push(REVERSE_CODES[mode]);
    } else {
      const s = safeFilledFrames + emptyIdx;
      start.push(Math.floor(s * scale));
      end.push(Math.floor((s + 1) * scale));
      playmode.push(PLAYMODE_CODES.oneshot);
      reverse.push(REVERSE_CODES.oneshot);
      emptyIdx++;
    }
  }

  // Field set and values matched against 808.aif (a confirmed working OP-1 Field kit)
  const meta = {
    attack:      Array(24).fill(0),
    drum_version: DEVICE_DRUM_VERSION[deviceMode],
    dyna_env:    [0, 8192, 0, 0, 0, 0, 0, 0],
    end,
    fx_active:   false,
    fx_params:   [21362, 20456, 6125, 1023, 0, 0, 0, 0],
    fx_type:     'cwo',
    lfo_active:  false,
    lfo_params:  [12229, 392, 2000, 21048, 0, 0, 0, 0],
    lfo_type:    'random',
    mtime:       Math.floor(Date.now() / 1000),
    name:        kitName,
    octave:      0,
    pan:         Array(24).fill(16384),
    pan_ab:      Array(24).fill(false),
    pitch:       Array(24).fill(0),
    playmode,
    reverse,
    start,
    stereo:      deviceMode === 'op1field',
    type:        'drum',
    volume:      Array(24).fill(8192),
  };

  // All confirmed-working OP-1 Field kits have a newline (0x0a) immediately
  // after the closing `}` of the JSON. Without it the firmware fails to parse
  // the APPL metadata and falls back to auto-slicing.
  const json = JSON.stringify(meta) + '\n';
  const enc = new TextEncoder();
  const jsonBytes = enc.encode(json);
  if (jsonBytes.length > APPL_CONTENT_SIZE) {
    throw new Error(`Kit name too long — metadata exceeds ${APPL_CONTENT_SIZE} bytes`);
  }
  // Pad with spaces to exactly 4096 bytes — firmware reads a fixed-size block
  const block = new Uint8Array(APPL_CONTENT_SIZE);
  block.fill(0x20); // spaces
  block.set(jsonBytes);
  return new TextDecoder().decode(block);
}
