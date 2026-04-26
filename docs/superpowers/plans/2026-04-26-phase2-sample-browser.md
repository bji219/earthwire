# Phase 2: Sample Browser & OP-1-F Drum Kit Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/samples` page where users browse Xeno-canto bird recordings, Freesound nature sounds, and local files, assemble up to 24 samples into an OP-1-F drum kit, trim each sample with a waveform UI, and export a single `.aif` file.

**Architecture:** Standalone SvelteKit route at `/samples` with its own layout (no transport controls). Kit state uses a two-layer store: serialisable `SlotMeta` in `localStorage`, live `AudioBuffer` references in memory. All audio processing (decode, trim, stitch, AIFF encode) runs client-side via Web Audio API. API proxies on the server hide credentials for Freesound and Xeno-canto.

**Tech Stack:** SvelteKit 4, Svelte 4, TypeScript, Vitest, Web Audio API (AudioContext / OfflineAudioContext), IndexedDB, Canvas API.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/lib/kit/types.ts` | SlotMeta, KitMeta, SampleSource types + SLOT_COLORS |
| `src/lib/kit/op1-metadata.ts` | Build OP-1 APPL JSON (drum_version-aware) |
| `src/lib/kit/op1-metadata.test.ts` | Unit tests for APPL JSON builder |
| `src/lib/kit/aiff-encoder.ts` | Binary AIFF writer (FORM > COMM > APPL > SSND) |
| `src/lib/kit/aiff-encoder.test.ts` | Unit tests for AIFF encoder |
| `src/lib/kit/audio-processor.ts` | Peak extraction, trim via OfflineAudioContext, stitch |
| `src/lib/stores/my-sounds.ts` | IndexedDB CRUD for local audio files |
| `src/lib/stores/kit.ts` | Two-layer kit store (localStorage meta + in-memory buffers) |
| `src/routes/api/xeno-canto/+server.ts` | Proxy to xeno-canto.org API |
| `src/routes/api/freesound/+server.ts` | Proxy to freesound.org API |
| `src/routes/samples/+layout.svelte` | Simplified header (no transport) |
| `src/routes/samples/+page.svelte` | Split-panel page |
| `src/lib/components/SegmentBar.svelte` | Multi-color proportional duration bar |
| `src/lib/components/WaveformTrim.svelte` | Dark waveform canvas + draggable trim handle |
| `src/lib/components/SlotRow.svelte` | Single kit slot row with mini waveform |
| `src/lib/components/KitBuilder.svelte` | Right panel: 24 slots + export |
| `src/lib/components/MySoundsTab.svelte` | Drag-and-drop local files tab |
| `src/lib/components/FreesoundTab.svelte` | Freesound search + results |
| `src/lib/components/XenocantoTab.svelte` | Xeno-canto search + results |
| `src/lib/components/BirdSoundsTab.svelte` | Curated species-family browser |
| `src/lib/components/SampleBrowser.svelte` | Left panel: tabs + content |
| `src/lib/components/TopBar.svelte` | **Modify:** add Samples nav link |
| `.env.example` | **Modify:** add FREESOUND_CLIENT_ID, XENO_CANTO_KEY |

---

## Task 1: Kit Types + Constants

**Files:**
- Create: `src/lib/kit/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kit/types.ts
git commit -m "feat(kit): add kit types, constants, and slot metadata"
```

---

## Task 2: OP-1 Metadata Builder + Tests

**Files:**
- Create: `src/lib/kit/op1-metadata.ts`
- Create: `src/lib/kit/op1-metadata.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/kit/op1-metadata.test.ts
import { describe, it, expect } from 'vitest';
import { buildOp1Metadata } from './op1-metadata';

describe('buildOp1Metadata', () => {
  it('outputs 24-element arrays', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const meta = JSON.parse(result);
    expect(meta.start).toHaveLength(24);
    expect(meta.end).toHaveLength(24);
    expect(meta.pitch).toHaveLength(24);
    expect(meta.volume).toHaveLength(24);
    expect(meta.pan).toHaveLength(24);
    expect(meta.playmode).toHaveLength(24);
  });

  it('sets drum_version 1 for op1 mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(JSON.parse(result).drum_version).toBe(1);
  });

  it('sets drum_version 2 for op1field mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(JSON.parse(result).drum_version).toBe(2);
  });

  it('calculates start/end frame positions from trim durations', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number })[];
    slots[0] = { trimDuration: 1.0 }; // 44100 frames
    slots[1] = { trimDuration: 0.5 }; // 22050 frames
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots,
      sampleRate: 44100,
    });
    const meta = JSON.parse(result);
    expect(meta.start[0]).toBe(0);
    expect(meta.end[0]).toBe(44100);
    expect(meta.start[1]).toBe(44100);
    expect(meta.end[1]).toBe(44100 + 22050);
  });

  it('empty slots have start === end', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const meta = JSON.parse(result);
    for (let i = 0; i < 24; i++) {
      expect(meta.start[i]).toBe(meta.end[i]);
    }
  });

  it('result is null-terminated and even byte length', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(result.endsWith('\0')).toBe(true);
    const bytes = new TextEncoder().encode(result);
    expect(bytes.length % 2).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm vitest run src/lib/kit/op1-metadata.test.ts
```
Expected: FAIL — `op1-metadata` module not found.

- [ ] **Step 3: Implement the metadata builder**

```typescript
// src/lib/kit/op1-metadata.ts
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm vitest run src/lib/kit/op1-metadata.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kit/op1-metadata.ts src/lib/kit/op1-metadata.test.ts
git commit -m "feat(kit): add OP-1 APPL metadata builder with tests"
```

---

## Task 3: AIFF Encoder + Tests

**Files:**
- Create: `src/lib/kit/aiff-encoder.ts`
- Create: `src/lib/kit/aiff-encoder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/kit/aiff-encoder.test.ts
import { describe, it, expect } from 'vitest';
import { encodeAiff } from './aiff-encoder';

function makeOptions(overrides = {}) {
  return {
    sampleRate: 44100,
    numChannels: 1,
    bitDepth: 16,
    samples: new Float32Array([0, 0.5, -0.5, 1, -1]),
    applJson: '{"test":1}\0',
    ...overrides,
  };
}

describe('encodeAiff', () => {
  it('starts with FORM chunk', () => {
    const buf = encodeAiff(makeOptions());
    const tag = String.fromCharCode(...buf.slice(0, 4));
    expect(tag).toBe('FORM');
  });

  it('FORM type is AIFF', () => {
    const buf = encodeAiff(makeOptions());
    const type = String.fromCharCode(...buf.slice(8, 12));
    expect(type).toBe('AIFF');
  });

  it('chunk order is COMM then APPL then SSND', () => {
    const buf = encodeAiff(makeOptions());
    const view = new DataView(buf.buffer);
    // Skip FORM header (12 bytes), find chunk tags
    let offset = 12;
    const chunkOrder: string[] = [];
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      chunkOrder.push(tag);
      offset += 8 + size + (size % 2); // chunks are padded to even length
    }
    expect(chunkOrder).toEqual(['COMM', 'APPL', 'SSND']);
  });

  it('COMM chunk has correct numChannels', () => {
    const buf = encodeAiff(makeOptions({ numChannels: 2 }));
    const view = new DataView(buf.buffer);
    // FORM(12) + COMM tag+size(8) = offset 20, numChannels at 20
    expect(view.getInt16(20, false)).toBe(2);
  });

  it('SSND sample data matches input for 16-bit', () => {
    const samples = new Float32Array([0, 1, -1]);
    const buf = encodeAiff(makeOptions({ samples, bitDepth: 16 }));
    // find SSND chunk
    const view = new DataView(buf.buffer);
    let offset = 12;
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      if (tag === 'SSND') {
        // skip 8 bytes offset+blockSize header
        const s0 = view.getInt16(offset + 8 + 8, false);
        const s1 = view.getInt16(offset + 8 + 8 + 2, false);
        const s2 = view.getInt16(offset + 8 + 8 + 4, false);
        expect(s0).toBe(0);
        expect(s1).toBe(32767);
        expect(s2).toBe(-32767);
        return;
      }
      offset += 8 + size + (size % 2);
    }
    throw new Error('SSND chunk not found');
  });

  it('total buffer length is even', () => {
    const buf = encodeAiff(makeOptions());
    expect(buf.length % 2).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm vitest run src/lib/kit/aiff-encoder.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the AIFF encoder**

```typescript
// src/lib/kit/aiff-encoder.ts

export interface AiffOptions {
  sampleRate: number;
  numChannels: number;
  bitDepth: number;
  samples: Float32Array;  // interleaved, -1..1
  applJson: string;       // null-terminated JSON from buildOp1Metadata()
}

// 80-bit IEEE 754 extended for common sample rates
const SAMPLE_RATE_BYTES: Record<number, number[]> = {
  44100: [0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  48000: [0x40, 0x0E, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

function convertSamples(samples: Float32Array, bitDepth: number): Uint8Array {
  const bytesPerSample = bitDepth / 8;
  const out = new Uint8Array(samples.length * bytesPerSample);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    if (bitDepth === 16) {
      const val = clamped < 0
        ? Math.round(clamped * 32768)
        : Math.round(clamped * 32767);
      view.setInt16(i * 2, val, false);
    } else {
      // 24-bit big-endian
      const val = clamped < 0
        ? Math.round(clamped * 8388608)
        : Math.round(clamped * 8388607);
      const o = i * 3;
      out[o]     = (val >> 16) & 0xFF;
      out[o + 1] = (val >> 8)  & 0xFF;
      out[o + 2] =  val        & 0xFF;
    }
  }
  return out;
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

export function encodeAiff(opts: AiffOptions): Uint8Array {
  const { sampleRate, numChannels, bitDepth, samples, applJson } = opts;
  const numFrames = Math.floor(samples.length / numChannels);

  // SSND sample data
  const pcmData = convertSamples(samples, bitDepth);

  // APPL payload: "op-1" (4 bytes) + JSON bytes, padded to even
  const jsonBytes = new TextEncoder().encode(applJson);
  const applPayloadSize = 4 + jsonBytes.length;
  const applPad = applPayloadSize % 2 !== 0 ? 1 : 0;

  // Sample rate bytes (80-bit extended)
  const srBytes = SAMPLE_RATE_BYTES[sampleRate];
  if (!srBytes) throw new Error(`Unsupported sample rate: ${sampleRate}`);

  // Chunk sizes
  const commDataSize = 18;          // 2+4+2+10
  const ssndDataSize = 8 + pcmData.length; // offset(4)+blockSize(4)+data
  const applDataSize = applPayloadSize;

  // FORM size = "AIFF"(4) + chunks (each: tag(4)+size(4)+data+pad)
  const formContentSize =
    4 +
    (8 + commDataSize) +
    (8 + applDataSize + applPad) +
    (8 + ssndDataSize);

  const totalSize = 8 + formContentSize; // FORM tag + size + content
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let o = 0;

  // FORM header
  writeTag(view, o, 'FORM'); o += 4;
  view.setUint32(o, formContentSize, false); o += 4;
  writeTag(view, o, 'AIFF'); o += 4;

  // COMM chunk
  writeTag(view, o, 'COMM'); o += 4;
  view.setUint32(o, commDataSize, false); o += 4;
  view.setInt16(o, numChannels, false);   o += 2;
  view.setUint32(o, numFrames, false);    o += 4;
  view.setInt16(o, bitDepth, false);      o += 2;
  for (const b of srBytes) { view.setUint8(o++, b); }

  // APPL chunk
  writeTag(view, o, 'APPL'); o += 4;
  view.setUint32(o, applDataSize, false); o += 4;
  writeTag(view, o, 'op-1'); o += 4;
  buf.set(jsonBytes, o); o += jsonBytes.length;
  if (applPad) o++; // pad byte

  // SSND chunk
  writeTag(view, o, 'SSND'); o += 4;
  view.setUint32(o, ssndDataSize, false); o += 4;
  view.setUint32(o, 0, false); o += 4; // offset
  view.setUint32(o, 0, false); o += 4; // blockSize
  buf.set(pcmData, o);

  return buf;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm vitest run src/lib/kit/aiff-encoder.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kit/aiff-encoder.ts src/lib/kit/aiff-encoder.test.ts
git commit -m "feat(kit): add AIFF binary encoder with COMM > APPL > SSND chunk order"
```

---

## Task 4: Audio Processor

**Files:**
- Create: `src/lib/kit/audio-processor.ts`

> Note: Web Audio API isn't available in Vitest's jsdom environment. Test manually via the browser after Task 12 (export flow).

- [ ] **Step 1: Create the audio processor module**

```typescript
// src/lib/kit/audio-processor.ts

/**
 * Extract peak amplitude values from an AudioBuffer for waveform rendering.
 * Returns an array of `numBars` values in 0..1 range.
 */
export function extractPeaks(buffer: AudioBuffer, numBars: number): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / numBars);
  const peaks: number[] = [];
  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      max = Math.max(max, Math.abs(channelData[start + j] ?? 0));
    }
    peaks.push(max);
  }
  return peaks;
}

/**
 * Convert peaks array to an SVG polyline path string.
 * Draws a center-line waveform (amplitude reflected above and below).
 */
export function peaksToSvgPath(
  peaks: number[],
  width: number,
  height: number
): string {
  if (peaks.length === 0) return '';
  const mid = height / 2;
  return peaks
    .map((peak, i) => {
      const x = (i / Math.max(peaks.length - 1, 1)) * width;
      const y = mid - peak * mid * 0.9;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Trim an AudioBuffer to [trimStart, trimEnd] seconds using OfflineAudioContext.
 * Downmixes to `numChannels` output channels.
 */
export async function trimBuffer(
  source: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  numChannels: number,
  sampleRate: number
): Promise<AudioBuffer> {
  const duration = trimEnd - trimStart;
  const frameCount = Math.round(duration * sampleRate);
  if (frameCount <= 0) throw new Error('Trim duration must be > 0');

  const ctx = new OfflineAudioContext(numChannels, frameCount, sampleRate);
  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = source;
  bufferSource.connect(ctx.destination);
  bufferSource.start(0, trimStart, duration);

  return ctx.startRendering();
}

/**
 * Stitch an array of AudioBuffers into one interleaved Float32Array.
 * Empty slots (null) contribute silence for 0 frames (skipped).
 */
export function stitchBuffers(
  buffers: (AudioBuffer | null)[],
  numChannels: number
): Float32Array {
  const totalFrames = buffers.reduce(
    (sum, b) => sum + (b ? b.length : 0),
    0
  );
  const out = new Float32Array(totalFrames * numChannels);
  let cursor = 0;

  for (const buf of buffers) {
    if (!buf) continue;
    for (let frame = 0; frame < buf.length; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const srcCh = ch < buf.numberOfChannels ? ch : 0; // downmix
        out[cursor++] = buf.getChannelData(srcCh)[frame];
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kit/audio-processor.ts
git commit -m "feat(kit): add audio processor (peaks, trim, stitch)"
```

---

## Task 5: Stores (My Sounds + Kit)

**Files:**
- Create: `src/lib/stores/my-sounds.ts`
- Create: `src/lib/stores/kit.ts`

- [ ] **Step 1: Create My Sounds IndexedDB store**

```typescript
// src/lib/stores/my-sounds.ts

export interface LocalSound {
  id: string;          // crypto.randomUUID()
  name: string;
  duration: number;    // seconds
  data: ArrayBuffer;
}

const DB_NAME = 'earthwire-sounds';
const STORE  = 'sounds';
const DB_VER = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveSound(sound: LocalSound): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(sound);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadSounds(): Promise<LocalSound[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as LocalSound[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteSound(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: Create the two-layer kit store**

```typescript
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

function createKitStore() {
  const { subscribe, update, set } = writable<KitMeta>(loadMeta());
  // In-memory AudioBuffer map — not persisted
  const buffers = new Map<number, AudioBuffer>();

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
      buffers.set(index, buffer);
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
      buffers.delete(index);
      applyUpdate(kit => {
        const slots = [...kit.slots];
        slots[index] = null;
        return { ...kit, slots };
      });
    },

    getBuffer(index: number): AudioBuffer | undefined {
      return buffers.get(index);
    },

    setBuffer(index: number, buffer: AudioBuffer) {
      buffers.set(index, buffer);
    },

    setDeviceMode(mode: DeviceMode) {
      applyUpdate(kit => ({ ...kit, deviceMode: mode }));
    },

    setName(name: string) {
      applyUpdate(kit => ({ ...kit, name }));
    },

    reset() {
      buffers.clear();
      const fresh = { ...DEFAULT_KIT, slots: Array(24).fill(null) };
      set(fresh);
      saveMeta(fresh);
    },
  };
}

export const kit = createKitStore();
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/my-sounds.ts src/lib/stores/kit.ts
git commit -m "feat(kit): add my-sounds IndexedDB store and two-layer kit store"
```

---

## Task 6: API Proxies

**Files:**
- Create: `src/routes/api/xeno-canto/+server.ts`
- Create: `src/routes/api/freesound/+server.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create Xeno-canto proxy**

```typescript
// src/routes/api/xeno-canto/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { XENO_CANTO_KEY } from '$env/static/private';

const BASE = 'https://xeno-canto.org/api/2/recordings';

export const GET: RequestHandler = async ({ url }) => {
  const query    = url.searchParams.get('q') ?? '';
  const quality  = url.searchParams.get('quality') ?? '';
  const len      = url.searchParams.get('len') ?? '';
  const country  = url.searchParams.get('country') ?? '';
  const page     = url.searchParams.get('page') ?? '1';

  let q = query;
  if (quality) q += ` q:${quality}`;
  if (country) q += ` cnt:${country}`;
  if (len)     q += ` len:${len}`;

  const params = new URLSearchParams({ query: q, page });
  const headers: Record<string, string> = {};
  if (XENO_CANTO_KEY) headers['Authorization'] = `Bearer ${XENO_CANTO_KEY}`;

  try {
    const res = await fetch(`${BASE}?${params}`, { headers });
    if (!res.ok) throw error(res.status, 'Xeno-canto API error');
    const data = await res.json();
    return json(data);
  } catch (e: any) {
    throw error(500, e?.message ?? 'Failed to fetch Xeno-canto');
  }
};
```

- [ ] **Step 2: Create Freesound proxy**

```typescript
// src/routes/api/freesound/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FREESOUND_CLIENT_ID } from '$env/static/private';

const SEARCH_BASE   = 'https://freesound.org/apiv2/search/text/';
const DOWNLOAD_BASE = 'https://freesound.org/apiv2/sounds/';

export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action') ?? 'search';

  if (action === 'search') {
    const query    = url.searchParams.get('q') ?? '';
    const maxLen   = url.searchParams.get('max_duration') ?? '';
    const cc0Only  = url.searchParams.get('cc0') === '1';
    const page     = url.searchParams.get('page') ?? '1';

    const params = new URLSearchParams({
      query,
      token: FREESOUND_CLIENT_ID,
      fields: 'id,name,duration,license,previews,username,url',
      page_size: '20',
      page,
    });
    if (maxLen) params.set('filter', `duration:[0 TO ${maxLen}]`);
    if (cc0Only) {
      const existing = params.get('filter') ?? '';
      params.set('filter', `${existing} license:("Creative Commons 0")`.trim());
    }

    try {
      const res = await fetch(`${SEARCH_BASE}?${params}`);
      if (!res.ok) throw error(res.status, 'Freesound search error');
      return json(await res.json());
    } catch (e: any) {
      throw error(500, e?.message ?? 'Freesound search failed');
    }
  }

  if (action === 'download') {
    // Proxy the HQ preview audio bytes to avoid CORS on some sources
    const previewUrl = url.searchParams.get('url') ?? '';
    if (!previewUrl.startsWith('https://cdn.freesound.org/')) {
      throw error(400, 'Invalid preview URL');
    }
    try {
      const res = await fetch(previewUrl);
      if (!res.ok) throw error(res.status, 'Preview fetch failed');
      const bytes = await res.arrayBuffer();
      return new Response(bytes, {
        headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg' },
      });
    } catch (e: any) {
      throw error(500, e?.message ?? 'Download failed');
    }
  }

  throw error(400, 'Unknown action');
};
```

- [ ] **Step 3: Update .env.example**

Add to `.env.example`:
```
# Freesound API (required for Freesound tab)
# Get at: https://freesound.org/apiv2/apply/
FREESOUND_CLIENT_ID=your_client_id_here

# Xeno-canto API key (optional — keyless works for now)
# Get at: https://xeno-canto.org/
XENO_CANTO_KEY=
```

- [ ] **Step 4: Add env vars to SvelteKit** — edit `src/app.d.ts` if needed (SvelteKit infers from `$env/static/private` automatically, no changes needed unless a `env.d.ts` is used).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/xeno-canto/+server.ts src/routes/api/freesound/+server.ts .env.example
git commit -m "feat(api): add Xeno-canto and Freesound proxy routes"
```

---

## Task 7: Samples Layout + Page Scaffold + TopBar Link

**Files:**
- Create: `src/routes/samples/+layout.svelte`
- Create: `src/routes/samples/+page.svelte`
- Modify: `src/lib/components/TopBar.svelte`

- [ ] **Step 1: Create the samples layout (simplified header)**

```svelte
<!-- src/routes/samples/+layout.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="samples-app">
  <header class="samples-header">
    <button class="brand" on:click={() => goto('/')}>Earthwire</button>
    <nav>
      <a href="/" class="nav-link">Sequencer</a>
      <a href="/samples" class="nav-link active">Samples</a>
    </nav>
  </header>
  <main>
    <slot />
  </main>
</div>

<style>
  .samples-app { display: flex; flex-direction: column; height: 100vh; background: var(--bg-primary); }
  .samples-header {
    display: flex; align-items: center; gap: 1.5rem;
    padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--border);
    font-size: 0.78rem; background: var(--bg-primary); flex-shrink: 0;
  }
  .brand {
    font-weight: 700; letter-spacing: -0.02em; background: none;
    border: none; cursor: pointer; color: var(--text-primary); font-size: 0.85rem;
  }
  nav { display: flex; gap: 1rem; }
  .nav-link { color: var(--text-muted); text-decoration: none; }
  .nav-link.active { color: var(--text-primary); font-weight: 600; }
  main { flex: 1; overflow: hidden; display: flex; }
</style>
```

- [ ] **Step 2: Create the split-panel page scaffold**

```svelte
<!-- src/routes/samples/+page.svelte -->
<script lang="ts">
  // Components imported in later tasks
</script>

<div class="samples-page">
  <div class="browser-panel">
    <!-- SampleBrowser goes here (Task 11) -->
    <p style="padding:1rem;color:var(--text-muted);font-size:0.8rem">Browser coming soon…</p>
  </div>
  <div class="kit-panel">
    <!-- KitBuilder goes here (Task 10) -->
    <p style="padding:1rem;color:var(--text-muted);font-size:0.8rem">Kit builder coming soon…</p>
  </div>
</div>

<style>
  .samples-page {
    display: flex; flex: 1; overflow: hidden;
    font-family: var(--font-body);
  }
  .browser-panel { flex: 1; overflow: hidden; border-right: 1px solid var(--border); }
  .kit-panel { width: 300px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column; }
</style>
```

- [ ] **Step 3: Add Samples link to TopBar**

Open `src/lib/components/TopBar.svelte`. Find the line with the brand name "Earthwire" (near the top of the template). Add a nav link after it:

```svelte
<!-- After the .brand div / before the transport controls -->
<a href="/samples" class="samples-link">Samples</a>
```

Add the style:
```svelte
.samples-link {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-decoration: none;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}
.samples-link:hover { color: var(--accent); }
```

- [ ] **Step 4: Start dev server and verify**

```bash
pnpm dev
```
- Navigate to `http://localhost:5173` — confirm "Samples" link appears in the TopBar
- Click it — confirm `/samples` loads with simplified header and two empty panels
- Back button → main app still works

- [ ] **Step 5: Commit**

```bash
git add src/routes/samples/ src/lib/components/TopBar.svelte
git commit -m "feat(samples): add /samples route with split-panel layout and TopBar link"
```

---

## Task 8: SegmentBar Component

**Files:**
- Create: `src/lib/components/SegmentBar.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/SegmentBar.svelte -->
<script lang="ts">
  import { SLOT_COLORS, DEVICE_LIMITS, formatDuration } from '$lib/kit/types';
  import type { SlotMeta, DeviceMode } from '$lib/kit/types';

  export let slots: (SlotMeta | null)[];
  export let deviceMode: DeviceMode;

  $: maxSeconds = DEVICE_LIMITS[deviceMode];
  $: usedSeconds = slots.reduce((sum, s) => sum + (s ? s.trimEnd - s.trimStart : 0), 0);
  $: usedPct = Math.min(usedSeconds / maxSeconds, 1) * 100;

  $: barClass = usedPct > 100 ? 'over' : usedPct > 80 ? 'warn' : '';
</script>

<div class="segment-wrap">
  <div class="segment-bar">
    {#each slots as slot, i}
      {#if slot}
        {@const pct = ((slot.trimEnd - slot.trimStart) / maxSeconds) * 100}
        <div
          class="segment"
          style="width:{pct}%;background:{SLOT_COLORS[i]}"
          title="Slot {i + 1}: {slot.name} ({formatDuration(slot.trimEnd - slot.trimStart)})"
        ></div>
      {/if}
    {/each}
    <div class="segment-empty" style="flex:1"></div>
  </div>
  <div class="segment-labels">
    <span class="label-used {barClass}">{formatDuration(usedSeconds)} used</span>
    <span class="label-total">{maxSeconds}s total</span>
  </div>
</div>

<style>
  .segment-wrap { padding: 0.6rem 1rem 0; }

  .segment-bar {
    height: 28px;
    display: flex;
    border-radius: 3px;
    overflow: hidden;
  }

  .segment { height: 100%; flex-shrink: 0; }

  .segment-empty {
    background-image: repeating-linear-gradient(
      -45deg,
      transparent, transparent 3px,
      rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
    );
    background-color: var(--bg-secondary);
  }

  .segment-labels {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0 0.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.63rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .label-used.warn { color: #c08030; }
  .label-used.over { color: #c0392b; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/SegmentBar.svelte
git commit -m "feat(kit): add multi-color segment bar component"
```

---

## Task 9: WaveformTrim Component

**Files:**
- Create: `src/lib/components/WaveformTrim.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/WaveformTrim.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { extractPeaks } from '$lib/kit/audio-processor';
  import { formatDuration } from '$lib/kit/types';

  export let buffer: AudioBuffer;
  export let trimStart: number;   // seconds
  export let trimEnd: number;     // seconds
  export let fullDuration: number;

  const dispatch = createEventDispatcher<{
    change: { trimStart: number; trimEnd: number };
    preview: void;
  }>();

  let canvas: HTMLCanvasElement;
  const NUM_BARS = 120;
  let peaks: number[] = [];

  $: if (buffer) peaks = extractPeaks(buffer, NUM_BARS);

  onMount(() => { drawWaveform(); });
  $: if (peaks.length && canvas) drawWaveform();

  function drawWaveform() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const mid = height / 2;

    ctx.clearRect(0, 0, width, height);

    const trimFrac    = trimEnd / fullDuration;
    const trimStartFx = (trimStart / fullDuration) * width;
    const trimEndPx   = trimFrac * width;

    peaks.forEach((peak, i) => {
      const x = (i / (NUM_BARS - 1)) * width;
      const h = peak * mid * 0.9;
      const inTrim = x >= trimStartFx && x <= trimEndPx;
      ctx.fillStyle = inTrim ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, mid - h, 1.5, h * 2);
    });
  }

  // Trim end drag
  let dragging: 'end' | 'start' | null = null;

  function pxToSeconds(px: number): number {
    return (px / canvas.clientWidth) * fullDuration;
  }

  function onPointerDown(e: PointerEvent, handle: 'start' | 'end') {
    dragging = handle;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const secs = Math.max(0, Math.min(fullDuration, pxToSeconds(px)));

    if (dragging === 'end') {
      const newEnd = Math.max(trimStart + 0.05, secs);
      dispatch('change', { trimStart, trimEnd: newEnd });
    } else {
      const newStart = Math.min(trimEnd - 0.05, secs);
      dispatch('change', { trimStart: newStart, trimEnd });
    }
  }

  function onPointerUp() { dragging = null; }

  function handleTextInput(e: Event, field: 'start' | 'end') {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(val)) return;
    if (field === 'end') {
      dispatch('change', { trimStart, trimEnd: Math.min(fullDuration, Math.max(trimStart + 0.05, val)) });
    } else {
      dispatch('change', { trimStart: Math.max(0, Math.min(trimEnd - 0.05, val)), trimEnd });
    }
  }

  $: startPct = (trimStart / fullDuration) * 100;
  $: endPct   = (trimEnd   / fullDuration) * 100;
</script>

<svelte:window on:pointermove={onPointerMove} on:pointerup={onPointerUp} />

<div class="waveform-expand">
  <div class="canvas-wrap">
    <canvas
      bind:this={canvas}
      width={600}
      height={60}
      style="width:100%;height:48px"
    ></canvas>

    <!-- Start handle -->
    <div
      class="handle handle-start"
      style="left:{startPct}%"
      on:pointerdown={e => onPointerDown(e, 'start')}
    ></div>

    <!-- End handle -->
    <div
      class="handle handle-end"
      style="left:{endPct}%"
      on:pointerdown={e => onPointerDown(e, 'end')}
    ></div>

    <!-- Trim overlay (outside the trim region) -->
    <div class="trim-shade trim-shade-left"  style="width:{startPct}%"></div>
    <div class="trim-shade trim-shade-right" style="width:{100 - endPct}%"></div>
  </div>

  <div class="time-row">
    <span>{formatDuration(trimStart)}</span>
    <span>← trim region →</span>
    <span>{formatDuration(fullDuration)}</span>
  </div>

  <div class="controls-row">
    <span class="ctrl-label">start</span>
    <input
      class="ctrl-input"
      type="number" min="0" max={trimEnd - 0.05} step="0.05"
      value={trimStart.toFixed(2)}
      on:change={e => handleTextInput(e, 'start')}
    />
    <span class="ctrl-label">end</span>
    <input
      class="ctrl-input"
      type="number" min={trimStart + 0.05} max={fullDuration} step="0.05"
      value={trimEnd.toFixed(2)}
      on:change={e => handleTextInput(e, 'end')}
    />
    <span class="ctrl-label">of {formatDuration(fullDuration)}</span>
    <button class="preview-btn" on:click={() => dispatch('preview')}>▶ preview</button>
  </div>
</div>

<style>
  .waveform-expand { background: #111; padding: 0.5rem 0.75rem 0.65rem; }

  .canvas-wrap { position: relative; }

  .trim-shade {
    position: absolute; top: 0; height: 100%;
    background: rgba(0,0,0,0.5); pointer-events: none;
  }
  .trim-shade-left  { left: 0; }
  .trim-shade-right { right: 0; }

  .handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 10px; height: 22px;
    background: #4a7c59; border-radius: 2px; cursor: ew-resize; z-index: 2;
    touch-action: none;
  }

  .time-row {
    display: flex; justify-content: space-between;
    font-size: 0.6rem; color: #555; margin-top: 0.3rem;
    font-variant-numeric: tabular-nums;
  }

  .controls-row {
    display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem;
  }

  .ctrl-label { font-size: 0.62rem; color: #777; }

  .ctrl-input {
    width: 3.5rem; background: #222; color: #fff;
    border: 1px solid #333; border-radius: 3px;
    padding: 0.15rem 0.3rem; font-size: 0.68rem;
    text-align: center; font-variant-numeric: tabular-nums;
  }

  .preview-btn {
    margin-left: auto; font-size: 0.62rem; padding: 0.18rem 0.5rem;
    border: 1px solid #333; border-radius: 3px; color: #aaa;
    cursor: pointer; background: #222;
  }
  .preview-btn:hover { border-color: #4a7c59; color: #4a7c59; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/WaveformTrim.svelte
git commit -m "feat(kit): add dark-theme waveform trim component with drag handles"
```

---

## Task 10: SlotRow Component

**Files:**
- Create: `src/lib/components/SlotRow.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/SlotRow.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import WaveformTrim from './WaveformTrim.svelte';
  import { extractPeaks, peaksToSvgPath } from '$lib/kit/audio-processor';
  import { SLOT_COLORS, SLOT_NOTES, formatDuration } from '$lib/kit/types';
  import type { SlotMeta } from '$lib/kit/types';

  export let index: number;
  export let slot: SlotMeta | null;
  export let buffer: AudioBuffer | undefined;
  export let isActive: boolean = false;

  const dispatch = createEventDispatcher<{
    activate: void;
    clear: void;
    trim: { trimStart: number; trimEnd: number };
    preview: void;
  }>();

  const MINI_BARS = 32;
  const MINI_W = 70;
  const MINI_H = 22;

  $: peaks = buffer ? extractPeaks(buffer, MINI_BARS) : [];
  $: svgPath = peaksToSvgPath(peaks, MINI_W, MINI_H);
  $: color = SLOT_COLORS[index];
  $: note  = SLOT_NOTES[index];
  $: trimDuration = slot ? slot.trimEnd - slot.trimStart : 0;
</script>

<div class="slot-wrap">
  <!-- Main row -->
  <div
    class="slot-row"
    class:active={isActive}
    class:filled={!!slot}
    on:click={() => dispatch('activate')}
  >
    <span class="slot-num">{index + 1}</span>

    <span class="slot-dot-wrap">
      {#if slot}
        <span class="dot" style="background:{color}"></span>
      {:else}
        <span class="dot dot-empty"></span>
      {/if}
    </span>

    <span class="slot-name" class:empty={!slot}>
      {slot ? slot.name : `(${note})`}
    </span>

    {#if slot && svgPath}
      <svg class="mini-wave" viewBox="0 0 {MINI_W} {MINI_H}" preserveAspectRatio="none">
        <path d={svgPath} fill="none"
          stroke={isActive ? '#fff' : '#1a1a1a'}
          stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    {:else}
      <span class="mini-wave"></span>
    {/if}

    <span class="playmode-arrow">{slot ? '→' : ''}</span>

    <span class="slot-dur">
      {slot ? formatDuration(trimDuration) : ''}
    </span>

    {#if slot}
      <button
        class="clear-btn"
        on:click|stopPropagation={() => dispatch('clear')}
        title="Remove sample"
      >✕</button>
    {/if}
  </div>

  <!-- Expanded trim (only when active + has a slot + has buffer) -->
  {#if isActive && slot && buffer}
    <WaveformTrim
      {buffer}
      trimStart={slot.trimStart}
      trimEnd={slot.trimEnd}
      fullDuration={slot.fullDuration}
      on:change={e => dispatch('trim', e.detail)}
      on:preview={() => dispatch('preview')}
    />
  {/if}
</div>

<style>
  .slot-wrap { border-bottom: 1px solid var(--border-light); }

  .slot-row {
    display: flex; align-items: center; gap: 0;
    min-height: 32px; cursor: pointer; padding: 0;
    transition: background 80ms;
  }
  .slot-row:hover:not(.active) { background: var(--bg-secondary); }
  .slot-row.active { background: #1a1a1a; color: #fff; }

  .slot-num {
    font-size: 0.68rem; color: var(--text-muted); width: 2.2rem;
    text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-num { color: #666; }

  .slot-dot-wrap { width: 1rem; flex-shrink: 0; display: flex; justify-content: center; }
  .dot { width: 5px; height: 5px; border-radius: 50%; display: block; }
  .dot-empty { border: 1px solid #ccc; background: transparent; }
  .slot-row.active .dot-empty { border-color: #444; }

  .slot-name {
    flex: 1; font-size: 0.73rem; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; padding: 0 0.5rem; color: var(--text-primary);
  }
  .slot-name.empty { color: var(--text-muted); font-style: italic; }
  .slot-row.active .slot-name { color: #fff; }

  .mini-wave { width: 70px; height: 22px; flex-shrink: 0; }

  .playmode-arrow {
    font-size: 0.72rem; color: var(--text-muted); width: 1.2rem;
    text-align: center; flex-shrink: 0;
  }
  .slot-row.active .playmode-arrow { color: #555; }

  .slot-dur {
    font-size: 0.68rem; color: var(--text-muted); width: 3rem;
    text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-dur { color: #aaa; }

  .clear-btn {
    font-size: 0.58rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.5rem; flex-shrink: 0;
    opacity: 0;
  }
  .slot-row:hover .clear-btn { opacity: 1; }
  .clear-btn:hover { color: #c0392b; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/SlotRow.svelte
git commit -m "feat(kit): add SlotRow with mini waveform, active dark highlight, and inline expand"
```

---

## Task 11: KitBuilder Component

**Files:**
- Create: `src/lib/components/KitBuilder.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/KitBuilder.svelte -->
<script lang="ts">
  import { kit } from '$lib/stores/kit';
  import SegmentBar from './SegmentBar.svelte';
  import SlotRow from './SlotRow.svelte';
  import {
    DEVICE_LIMITS, DEVICE_CHANNELS, DEVICE_BIT_DEPTH,
    type DeviceMode,
  } from '$lib/kit/types';
  import { buildOp1Metadata } from '$lib/kit/op1-metadata';
  import { trimBuffer, stitchBuffers } from '$lib/kit/audio-processor';
  import { encodeAiff } from '$lib/kit/aiff-encoder';

  let activeSlot = 0;
  let exporting = false;
  let exportError = '';

  $: maxSeconds = DEVICE_LIMITS[$kit.deviceMode];
  $: usedSeconds = $kit.slots.reduce(
    (s, sl) => s + (sl ? sl.trimEnd - sl.trimStart : 0), 0
  );
  $: overBudget = usedSeconds > maxSeconds;

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeSlot = Math.min(23, activeSlot + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); activeSlot = Math.max(0,  activeSlot - 1); }
    if (e.key === ' ')         { e.preventDefault(); previewSlot(activeSlot); }
    if (e.key === 'Backspace') { e.preventDefault(); kit.clearSlot(activeSlot); }
  }

  function previewSlot(index: number) {
    const buf = kit.getBuffer(index);
    const slot = $kit.slots[index];
    if (!buf || !slot) return;
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0, slot.trimStart, slot.trimEnd - slot.trimStart);
    src.onended = () => ctx.close();
  }

  async function doExport() {
    exporting = true;
    exportError = '';
    try {
      const mode = $kit.deviceMode;
      const numChannels = DEVICE_CHANNELS[mode];
      const bitDepth    = DEVICE_BIT_DEPTH[mode];
      const sampleRate  = 44100;

      // Trim each slot's buffer
      const trimmedBuffers: (AudioBuffer | null)[] = await Promise.all(
        $kit.slots.map(async (slot, i) => {
          if (!slot) return null;
          const buf = kit.getBuffer(i);
          if (!buf) return null;
          return trimBuffer(buf, slot.trimStart, slot.trimEnd, numChannels, sampleRate);
        })
      );

      // Build APPL metadata
      const slotTimings = $kit.slots.map((slot, i) => {
        if (!slot || !trimmedBuffers[i]) return null;
        return { trimDuration: slot.trimEnd - slot.trimStart };
      });
      const applJson = buildOp1Metadata({
        kitName: $kit.name,
        deviceMode: mode,
        slots: slotTimings,
        sampleRate,
      });

      // Stitch
      const stitched = stitchBuffers(trimmedBuffers, numChannels);

      // Encode AIFF
      const aiffBytes = encodeAiff({
        sampleRate,
        numChannels,
        bitDepth,
        samples: stitched,
        applJson,
      });

      // Download
      const blob = new Blob([aiffBytes], { type: 'audio/x-aiff' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${$kit.name.replace(/[^a-z0-9_-]/gi, '_')}.aif`;
      a.click();
      URL.revokeObjectURL(url);

      // Attribution sidecar for Freesound samples
      const freesoundSlots = $kit.slots.filter(s => s?.sourceType === 'freesound');
      if (freesoundSlots.length > 0) {
        const lines = freesoundSlots.map(s =>
          `${s!.name} — ${s!.remoteSrc ?? 'freesound.org'}`
        );
        const txt = [
          `Credits for "${$kit.name}" drum kit`,
          '',
          'Freesound samples used (CC license — attribution required):',
          ...lines,
          '',
          'Generated by Earthwire — earthwire.app',
        ].join('\n');
        const tblob = new Blob([txt], { type: 'text/plain' });
        const ta = document.createElement('a');
        ta.href = URL.createObjectURL(tblob);
        ta.download = `${$kit.name.replace(/[^a-z0-9_-]/gi, '_')}-credits.txt`;
        ta.click();
      }
    } catch (err: any) {
      exportError = err?.message ?? 'Export failed';
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="kit-builder">
  <!-- Header -->
  <div class="kit-header">
    <span class="kit-label">drum kit</span>
    <input
      class="kit-name"
      value={$kit.name}
      on:change={e => kit.setName((e.target as HTMLInputElement).value)}
      placeholder="kit name…"
    />
  </div>

  <!-- Device toggle -->
  <div class="device-tabs">
    {#each ([['op1','OP–1 / OP–Z','mono · 12s'],['op1field','OP–1 field','stereo · 20s']] as [DeviceMode,string,string][]) as [mode, label, sub]}
      <button
        class="device-tab"
        class:active={$kit.deviceMode === mode}
        on:click={() => kit.setDeviceMode(mode)}
      >{label}<span class="device-sub">{sub}</span></button>
    {/each}
  </div>

  <!-- Segment bar -->
  <SegmentBar slots={$kit.slots} deviceMode={$kit.deviceMode} />

  <!-- Slot list -->
  <div class="slot-list">
    {#each $kit.slots as slot, i}
      <SlotRow
        index={i}
        {slot}
        buffer={kit.getBuffer(i)}
        isActive={activeSlot === i}
        on:activate={() => activeSlot = i}
        on:clear={() => kit.clearSlot(i)}
        on:trim={e => kit.updateSlotTrim(i, e.detail.trimStart, e.detail.trimEnd)}
        on:preview={() => previewSlot(i)}
      />
    {/each}
  </div>

  <!-- Footer -->
  <div class="kit-footer">
    <span class="slot-count">
      {$kit.slots.filter(Boolean).length} / 24 slots
    </span>
    <button
      class="export-btn"
      disabled={overBudget || exporting}
      title={overBudget ? `Over ${maxSeconds}s budget — trim samples` : ''}
      on:click={doExport}
    >
      {exporting ? 'exporting…' : 'export kit →'}
    </button>
  </div>

  {#if exportError}
    <p class="export-error">{exportError}</p>
  {/if}

  <p class="hint">arrow keys navigate · space previews · backspace deletes</p>
</div>

<style>
  .kit-builder { display: flex; flex-direction: column; height: 100%; font-family: var(--font-body); }

  .kit-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.55rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .kit-label { font-size: 0.78rem; font-weight: 600; }
  .kit-name {
    font-size: 0.74rem; border: none; background: transparent;
    color: var(--text-muted); text-align: right; outline: none; font-style: italic;
    font-family: var(--font-body); width: 50%;
  }

  .device-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .device-tab {
    flex: 1; padding: 0.38rem 0; font-size: 0.69rem; color: var(--text-muted);
    background: none; border: none; border-bottom: 2px solid transparent;
    cursor: pointer; display: flex; flex-direction: column; align-items: center;
    font-family: var(--font-body);
  }
  .device-tab.active { color: var(--text-primary); font-weight: 600; border-bottom-color: var(--text-primary); }
  .device-sub { font-size: 0.58rem; color: var(--text-muted); margin-top: 0.1rem; }

  .slot-list { flex: 1; overflow-y: auto; }

  .kit-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.65rem 1rem; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .slot-count { font-size: 0.68rem; color: var(--text-muted); }
  .export-btn {
    font-size: 0.75rem; font-weight: 500; background: none; border: none;
    cursor: pointer; font-family: var(--font-body); color: var(--text-primary);
  }
  .export-btn:disabled { color: var(--text-muted); cursor: not-allowed; }
  .export-btn:hover:not(:disabled) { opacity: 0.6; }

  .export-error { font-size: 0.7rem; color: #c0392b; padding: 0.3rem 1rem; }

  .hint {
    font-size: 0.6rem; color: var(--text-muted); padding: 0.4rem 1rem;
    border-top: 1px solid var(--border-light); flex-shrink: 0;
  }
</style>
```

- [ ] **Step 2: Wire KitBuilder into the page**

Edit `src/routes/samples/+page.svelte`:

```svelte
<script lang="ts">
  import KitBuilder from '$lib/components/KitBuilder.svelte';
</script>

<div class="samples-page">
  <div class="browser-panel">
    <p style="padding:1rem;color:var(--text-muted);font-size:0.8rem">Browser coming soon…</p>
  </div>
  <div class="kit-panel">
    <KitBuilder />
  </div>
</div>

<style>
  .samples-page { display: flex; flex: 1; overflow: hidden; font-family: var(--font-body); }
  .browser-panel { flex: 1; overflow: hidden; border-right: 1px solid var(--border); }
  .kit-panel { width: 300px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column; }
</style>
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/samples`. You should see the kit builder on the right with the segment bar, 24 slot rows, device mode tabs, and export button.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/KitBuilder.svelte src/routes/samples/+page.svelte
git commit -m "feat(kit): add KitBuilder with segment bar, slot rows, and AIFF export"
```

---

## Task 12: Sample Browser Tabs

**Files:**
- Create: `src/lib/components/MySoundsTab.svelte`
- Create: `src/lib/components/FreesoundTab.svelte`
- Create: `src/lib/components/XenocantoTab.svelte`
- Create: `src/lib/components/BirdSoundsTab.svelte`

- [ ] **Step 1: Create MySoundsTab**

```svelte
<!-- src/lib/components/MySoundsTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { loadSounds, saveSound, deleteSound, type LocalSound } from '$lib/stores/my-sounds';
  import { formatDuration } from '$lib/kit/types';

  const dispatch = createEventDispatcher<{ add: { sound: LocalSound; buffer: AudioBuffer } }>();

  let sounds: LocalSound[] = [];
  let dragging = false;
  let audioCtx: AudioContext | null = null;

  onMount(async () => { sounds = await loadSounds(); });

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const sound: LocalSound = {
        id: crypto.randomUUID(),
        name: file.name,
        duration: audioBuffer.duration,
        data: arrayBuffer,
      };
      await saveSound(sound);
      sounds = [...sounds, sound];
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    if (e.dataTransfer?.files) await addFiles(e.dataTransfer.files);
  }

  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) await addFiles(input.files);
  }

  async function playSound(sound: LocalSound) {
    const ctx = getCtx();
    const buf = await ctx.decodeAudioData(sound.data.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
  }

  async function addToKit(sound: LocalSound) {
    const ctx = getCtx();
    const buffer = await ctx.decodeAudioData(sound.data.slice(0));
    dispatch('add', { sound, buffer });
  }

  async function remove(sound: LocalSound) {
    await deleteSound(sound.id);
    sounds = sounds.filter(s => s.id !== sound.id);
  }
</script>

<div class="my-sounds">
  <!-- Drop zone -->
  <label
    class="drop-zone"
    class:dragging
    on:dragover|preventDefault={() => dragging = true}
    on:dragleave={() => dragging = false}
    on:drop={handleDrop}
  >
    <input type="file" accept="audio/*" multiple on:change={handleFileInput} style="display:none">
    <div class="drop-icon">📂</div>
    <div>drag and drop audio files here</div>
    <div class="drop-sub">or click to browse · mp3, wav, aiff, flac, ogg</div>
  </label>

  {#if sounds.length > 0}
    <div class="section-label">my library · {sounds.length} files</div>
    {#each sounds as sound}
      <div class="result-item">
        <button class="play-btn" on:click={() => playSound(sound)}>▶</button>
        <div class="result-info">
          <div class="result-name">{sound.name}</div>
          <div class="result-meta">local · {formatDuration(sound.duration)}</div>
        </div>
        <span class="result-dur">{formatDuration(sound.duration)}</span>
        <button class="add-btn" on:click={() => addToKit(sound)}>+ Add</button>
        <button class="del-btn" on:click={() => remove(sound)} title="Remove from library">✕</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .my-sounds { height: 100%; overflow-y: auto; }

  .drop-zone {
    display: block; margin: 1rem; border: 2px dashed var(--border);
    border-radius: 6px; padding: 1.5rem 1rem; text-align: center;
    color: var(--text-muted); font-size: 0.8rem; cursor: pointer;
    transition: border-color 150ms;
  }
  .drop-zone:hover, .drop-zone.dragging { border-color: var(--accent); color: var(--accent); }
  .drop-icon { font-size: 1.6rem; margin-bottom: 0.4rem; }
  .drop-sub { font-size: 0.67rem; color: var(--text-muted); margin-top: 0.3rem; }

  .section-label {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em;
    color: var(--text-muted); text-transform: uppercase; padding: 0.5rem 1rem 0.25rem;
  }

  .result-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-light);
  }
  .result-item:hover { background: var(--bg-secondary); }

  .play-btn {
    width: 20px; height: 20px; border-radius: 50%; background: var(--text-primary);
    color: var(--bg-primary); border: none; cursor: pointer;
    font-size: 0.55rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }

  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 0.77rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { font-size: 0.67rem; color: var(--text-muted); }

  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }

  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }

  .del-btn {
    font-size: 0.65rem; background: none; border: none; cursor: pointer;
    color: var(--text-muted); flex-shrink: 0;
  }
  .del-btn:hover { color: #c0392b; }
</style>
```

- [ ] **Step 2: Create FreesoundTab**

```svelte
<!-- src/lib/components/FreesoundTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatDuration } from '$lib/kit/types';

  const dispatch = createEventDispatcher<{ add: { name: string; previewUrl: string; buffer: AudioBuffer } }>();

  let query = '';
  let maxDuration = '';
  let cc0Only = false;
  let results: any[] = [];
  let loading = false;
  let error = '';
  let audioCtx: AudioContext | null = null;
  let playingId: number | null = null;

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = [];
    try {
      const params = new URLSearchParams({ action: 'search', q: query });
      if (maxDuration) params.set('max_duration', maxDuration);
      if (cc0Only) params.set('cc0', '1');
      const res = await fetch(`/api/freesound?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      results = data.results ?? [];
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function playPreview(result: any) {
    const url = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'];
    if (!url) return;
    playingId = result.id;
    const ctx = getCtx();
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
    src.onended = () => { if (playingId === result.id) playingId = null; };
  }

  async function addToKit(result: any) {
    const url = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'];
    if (!url) return;
    const ctx = getCtx();
    const res = await fetch(url);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    dispatch('add', { name: result.name, previewUrl: result.url, buffer });
  }
</script>

<div class="freesound-tab">
  <div class="search-bar">
    <input
      bind:value={query}
      placeholder="Search Freesound…"
      on:keydown={e => e.key === 'Enter' && search()}
    />
    <select bind:value={maxDuration}>
      <option value="">Any length</option>
      <option value="10">Under 10s</option>
      <option value="30">Under 30s</option>
    </select>
    <label class="cc0-toggle">
      <input type="checkbox" bind:checked={cc0Only}> CC0 only
    </label>
    <button on:click={search} disabled={loading}>
      {loading ? '…' : 'Search'}
    </button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if results.length > 0}
    <div class="section-label">{results.length} results</div>
    {#each results as result}
      <div class="result-item">
        <button class="play-btn" class:playing={playingId === result.id} on:click={() => playPreview(result)}>
          {playingId === result.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{result.name}</div>
          <div class="result-meta">{result.username} · {result.license?.includes('0') ? 'CC0' : 'CC'}</div>
        </div>
        <span class="result-dur">{formatDuration(result.duration)}</span>
        <button class="add-btn" on:click={() => addToKit(result)}>+ Add</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .freesound-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }

  .search-bar {
    display: flex; gap: 0.5rem; align-items: center;
    padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .search-bar input[type=text], .search-bar input:not([type]) {
    flex: 1; border: 1px solid var(--border); border-radius: 4px;
    padding: 0.35rem 0.6rem; font-size: 0.78rem; background: var(--bg-input);
    color: var(--text-primary); outline: none;
  }
  .search-bar select, .search-bar button {
    font-size: 0.75rem; padding: 0.3rem 0.5rem;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-input); color: var(--text-primary); cursor: pointer;
  }
  .cc0-toggle { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; display: flex; gap: 0.25rem; align-items: center; }

  .section-label {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em;
    color: var(--text-muted); text-transform: uppercase; padding: 0.5rem 1rem 0.25rem;
  }

  .result-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-light);
  }
  .result-item:hover { background: var(--bg-secondary); }

  .play-btn {
    width: 20px; height: 20px; border-radius: 50%; background: var(--text-primary);
    color: var(--bg-primary); border: none; cursor: pointer; font-size: 0.55rem;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .play-btn.playing { background: var(--accent); }

  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 0.77rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { font-size: 0.67rem; color: var(--text-muted); }
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }

  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }

  .error { font-size: 0.72rem; color: #c0392b; padding: 0.5rem 1rem; }
</style>
```

- [ ] **Step 3: Create XenocantoTab**

```svelte
<!-- src/lib/components/XenocantoTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatDuration } from '$lib/kit/types';

  const dispatch = createEventDispatcher<{ add: { name: string; remoteSrc: string; buffer: AudioBuffer } }>();

  let query = '';
  let quality = 'A';
  let country = '';
  let results: any[] = [];
  let loading = false;
  let error = '';
  let audioCtx: AudioContext | null = null;
  let playingId: string | null = null;

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = [];
    try {
      const params = new URLSearchParams({ q: query });
      if (quality) params.set('quality', quality);
      if (country) params.set('country', country);
      const res = await fetch(`/api/xeno-canto?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      results = data.recordings ?? [];
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  function getAudioUrl(rec: any): string {
    return rec.file ?? `https://xeno-canto.org/${rec.id}/download`;
  }

  async function playPreview(rec: any) {
    playingId = rec.id;
    const ctx = getCtx();
    const url = getAudioUrl(rec);
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
    src.onended = () => { if (playingId === rec.id) playingId = null; };
  }

  async function addToKit(rec: any) {
    const ctx = getCtx();
    const url = getAudioUrl(rec);
    const res = await fetch(url);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const name = `${rec['en'] || rec['gen']} ${rec['sp']} (XC${rec.id})`;
    dispatch('add', { name, remoteSrc: `https://xeno-canto.org/${rec.id}`, buffer });
  }
</script>

<div class="xeno-tab">
  <div class="search-bar">
    <input
      bind:value={query}
      placeholder="Species name (English or Latin)…"
      on:keydown={e => e.key === 'Enter' && search()}
    />
    <select bind:value={quality}>
      <option value="">All quality</option>
      <option value="A">Quality A</option>
      <option value="B">Quality B</option>
    </select>
    <input bind:value={country} placeholder="Country" style="width:5rem">
    <button on:click={search} disabled={loading}>{loading ? '…' : 'Search'}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if results.length > 0}
    <div class="section-label">{results.length} results · Xeno-canto</div>
    {#each results as rec}
      {@const dur = parseFloat(rec.length ?? '0')}
      <div class="result-item">
        <button class="play-btn" class:playing={playingId === rec.id} on:click={() => playPreview(rec)}>
          {playingId === rec.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{rec['en'] || rec['gen']} {rec['sp']}</div>
          <div class="result-meta">{rec.cnt} · XC{rec.id} · {rec.rec} · Q:{rec.q}</div>
        </div>
        <span class="result-dur">{formatDuration(dur)}</span>
        <button class="add-btn" on:click={() => addToKit(rec)}>+ Add</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .xeno-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .search-bar {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .search-bar input, .search-bar select, .search-bar button {
    font-size: 0.75rem; padding: 0.3rem 0.5rem;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-input); color: var(--text-primary);
  }
  .search-bar input { flex: 1; min-width: 8rem; outline: none; }
  .search-bar button { cursor: pointer; }
  .section-label {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em;
    color: var(--text-muted); text-transform: uppercase; padding: 0.5rem 1rem 0.25rem;
  }
  .result-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-light);
  }
  .result-item:hover { background: var(--bg-secondary); }
  .play-btn {
    width: 20px; height: 20px; border-radius: 50%; background: var(--text-primary);
    color: var(--bg-primary); border: none; cursor: pointer; font-size: 0.55rem;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .play-btn.playing { background: var(--accent); }
  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 0.77rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { font-size: 0.67rem; color: var(--text-muted); }
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }
  .error { font-size: 0.72rem; color: #c0392b; padding: 0.5rem 1rem; }
</style>
```

- [ ] **Step 4: Create BirdSoundsTab**

```svelte
<!-- src/lib/components/BirdSoundsTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import XenocantoTab from './XenocantoTab.svelte';

  const dispatch = createEventDispatcher();

  const FAMILIES = [
    { name: 'Warblers', query: 'warbler' },
    { name: 'Thrushes', query: 'thrush' },
    { name: 'Raptors', query: 'hawk eagle' },
    { name: 'Shorebirds', query: 'sandpiper plover' },
    { name: 'Owls', query: 'owl' },
    { name: 'Nightingales', query: 'nightingale' },
    { name: 'Finches', query: 'finch' },
    { name: 'Ducks & Geese', query: 'duck goose' },
    { name: 'Woodpeckers', query: 'woodpecker' },
    { name: 'Hummingbirds', query: 'hummingbird' },
    { name: 'Sparrows', query: 'sparrow' },
    { name: 'Crows & Jays', query: 'crow jay raven' },
  ];

  let selectedQuery = '';
</script>

<div class="bird-tab">
  {#if !selectedQuery}
    <div class="family-grid">
      {#each FAMILIES as fam}
        <button class="family-btn" on:click={() => selectedQuery = fam.query}>
          🐦 {fam.name}
        </button>
      {/each}
    </div>
  {:else}
    <div class="back-bar">
      <button class="back-btn" on:click={() => selectedQuery = ''}>← Back to families</button>
    </div>
    <!-- Reuse XenocantoTab with the pre-filled query -->
    <XenocantoTab
      on:add={e => dispatch('add', e.detail)}
    />
  {/if}
</div>

<style>
  .bird-tab { height: 100%; overflow-y: auto; }
  .family-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 1rem;
  }
  .family-btn {
    padding: 0.65rem 0.75rem; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-input); color: var(--text-primary); font-size: 0.78rem;
    cursor: pointer; text-align: left; font-family: var(--font-body);
  }
  .family-btn:hover { border-color: var(--accent); color: var(--accent); }
  .back-bar {
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border);
  }
  .back-btn {
    font-size: 0.75rem; background: none; border: none;
    color: var(--text-muted); cursor: pointer; padding: 0;
  }
  .back-btn:hover { color: var(--accent); }
</style>
```

> Note: BirdSoundsTab currently shows the family grid and then re-uses XenocantoTab as an embedded sub-view. The selected query needs to be passed as a prop to XenocantoTab. Update XenocantoTab to accept an `initialQuery: string = ''` prop and auto-search when it's set:

In `XenocantoTab.svelte`, add:
```svelte
export let initialQuery: string = '';
import { onMount } from 'svelte';
onMount(() => { if (initialQuery) { query = initialQuery; search(); } });
```

And in `BirdSoundsTab.svelte`:
```svelte
<XenocantoTab initialQuery={selectedQuery} on:add={e => dispatch('add', e.detail)} />
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/MySoundsTab.svelte src/lib/components/FreesoundTab.svelte \
        src/lib/components/XenocantoTab.svelte src/lib/components/BirdSoundsTab.svelte
git commit -m "feat(browser): add sample browser tabs (My Sounds, Freesound, Xeno-canto, Birds)"
```

---

## Task 13: SampleBrowser Assembly + Final Integration

**Files:**
- Create: `src/lib/components/SampleBrowser.svelte`
- Modify: `src/routes/samples/+page.svelte`

- [ ] **Step 1: Create SampleBrowser**

```svelte
<!-- src/lib/components/SampleBrowser.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MySoundsTab   from './MySoundsTab.svelte';
  import FreesoundTab  from './FreesoundTab.svelte';
  import XenocantoTab  from './XenocantoTab.svelte';
  import BirdSoundsTab from './BirdSoundsTab.svelte';

  const dispatch = createEventDispatcher<{
    add: { name: string; sourceType: 'local'|'freesound'|'xeno-canto'; remoteSrc?: string; buffer: AudioBuffer }
  }>();

  type Tab = 'my-sounds' | 'freesound' | 'xeno-canto' | 'birds';
  let activeTab: Tab = 'my-sounds';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'my-sounds',   label: '📁 My Sounds' },
    { id: 'freesound',   label: '🌿 Freesound'  },
    { id: 'xeno-canto',  label: 'Xeno-canto'    },
    { id: 'birds',       label: '🐦 Bird Sounds' },
  ];

  function handleMyAdd(e: CustomEvent<{ sound: any; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.sound.name, sourceType: 'local', buffer: e.detail.buffer });
  }
  function handleFsAdd(e: CustomEvent<{ name: string; previewUrl: string; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.name, sourceType: 'freesound', remoteSrc: e.detail.previewUrl, buffer: e.detail.buffer });
  }
  function handleXcAdd(e: CustomEvent<{ name: string; remoteSrc: string; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.name, sourceType: 'xeno-canto', remoteSrc: e.detail.remoteSrc, buffer: e.detail.buffer });
  }
</script>

<div class="sample-browser">
  <div class="tabs">
    {#each TABS as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        on:click={() => activeTab = tab.id}
      >{tab.label}</button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === 'my-sounds'}
      <MySoundsTab on:add={handleMyAdd} />
    {:else if activeTab === 'freesound'}
      <FreesoundTab on:add={handleFsAdd} />
    {:else if activeTab === 'xeno-canto'}
      <XenocantoTab on:add={handleXcAdd} />
    {:else}
      <BirdSoundsTab on:add={handleXcAdd} />
    {/if}
  </div>
</div>

<style>
  .sample-browser { display: flex; flex-direction: column; height: 100%; }

  .tabs {
    display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;
    overflow-x: auto;
  }
  .tab {
    padding: 0.55rem 1rem; font-size: 0.75rem; font-weight: 500;
    color: var(--text-muted); background: none; border: none;
    border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;
    font-family: var(--font-body);
  }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--text-primary); }
  .tab-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
```

- [ ] **Step 2: Wire SampleBrowser and KitBuilder into the page**

Replace `src/routes/samples/+page.svelte` with:

```svelte
<!-- src/routes/samples/+page.svelte -->
<script lang="ts">
  import SampleBrowser from '$lib/components/SampleBrowser.svelte';
  import KitBuilder    from '$lib/components/KitBuilder.svelte';
  import { kit } from '$lib/stores/kit';
  import { SLOT_COLORS } from '$lib/kit/types';
  import type { SlotMeta } from '$lib/kit/types';

  function handleAdd(e: CustomEvent<{
    name: string;
    sourceType: SlotMeta['sourceType'];
    remoteSrc?: string;
    buffer: AudioBuffer;
  }>) {
    const { name, sourceType, remoteSrc, buffer } = e.detail;

    // Find next empty slot
    const slots = $kit.slots;
    const index = slots.findIndex(s => s === null);
    if (index === -1) return; // kit full

    const meta: SlotMeta = {
      name,
      sourceType,
      remoteSrc,
      trimStart: 0,
      trimEnd: buffer.duration,
      fullDuration: buffer.duration,
      color: SLOT_COLORS[index],
    };
    kit.setSlot(index, meta, buffer);
  }
</script>

<div class="samples-page">
  <div class="browser-panel">
    <SampleBrowser on:add={handleAdd} />
  </div>
  <div class="kit-panel">
    <KitBuilder />
  </div>
</div>

<style>
  .samples-page { display: flex; flex: 1; overflow: hidden; font-family: var(--font-body); }
  .browser-panel { flex: 1; overflow: hidden; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
  .kit-panel { width: 300px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column; }
</style>
```

- [ ] **Step 3: Run full manual test**

```bash
pnpm dev
```

Run through the full flow:
1. Open `http://localhost:5173/samples`
2. My Sounds: drag a WAV file → confirm it appears in list → click ▶ to preview → click `+ Add` → confirm slot 1 fills in kit panel with mini waveform and duration
3. Click slot 1 in kit panel → confirm dark expand with waveform canvas → drag trim handle → confirm duration updates in segment bar
4. Freesound: search "ocean waves" → confirm results appear → add one to kit
5. Xeno-canto: search "nightingale" → confirm results → add one
6. Device mode: toggle OP-1/OP-Z → confirm budget changes to 12s
7. Export kit: click "export kit →" → confirm `.aif` downloads

- [ ] **Step 4: Run unit tests**

```bash
pnpm vitest run src/lib/kit/
```
Expected: all AIFF encoder + metadata builder tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SampleBrowser.svelte src/routes/samples/+page.svelte
git commit -m "feat(samples): wire SampleBrowser and KitBuilder — Phase 2 complete"
```

---

## Post-Implementation Checklist

- [ ] Add `FREESOUND_CLIENT_ID` to production environment variables (Vercel dashboard)
- [ ] Test export with >20s of samples to verify budget enforcement blocks export
- [ ] Verify AIFF binary: open in Audacity or Hex editor, confirm `FORM` → `COMM` → `APPL` → `SSND` chunk order
- [ ] Load exported `.aif` onto a physical OP-1-F via USB → confirm 24 pads load correctly
- [ ] Add `.superpowers/` to `.gitignore` if not already present
