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

// OP-1 / OP-1 Field encodes sample positions as scaled fixed-point integers.
// The entire max recording window maps to 0x7FFFFFFE (2,147,483,646).
// scale = 0x7FFFFFFE / (sampleRate × maxSeconds)
// Confirmed by DigiChain source (resources.js) and op-forums reverse-engineering.
const DEVICE_MAX_SECONDS: Record<DeviceMode, number> = { op1: 12, op1field: 20 };
const OP1_MAX = 0x7ffffffe; // 2,147,483,646

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

  const start: number[] = [];
  const end:   number[] = [];
  let fillCursor = 0;
  let emptyIdx   = 0;

  for (const slot of slots) {
    if (slot) {
      const slotStart = fillCursor;
      fillCursor += Math.round(slot.trimDuration * sampleRate);
      start.push(Math.floor(slotStart * scale));
      end.push(Math.floor(fillCursor * scale));
    } else {
      const s = filledFrames + emptyIdx;
      start.push(Math.floor(s * scale));
      end.push(Math.floor((s + 1) * scale));
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
    playmode:    Array(24).fill(4096),
    reverse:     Array(24).fill(12000),
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
