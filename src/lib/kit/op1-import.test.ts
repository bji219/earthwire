import { describe, it, expect } from 'vitest';
import { parseAiff } from './aiff-parser';
import { parseOp1Appl, _internals } from './op1-metadata-parse';
import { buildOp1Metadata, PLAYMODE_CODES, REVERSE_CODES } from './op1-metadata';
import { encodeAiff } from './aiff-encoder';
import type { SlotPlayMode } from './types';

// Minimal AudioBuffer polyfill (same shape as audio-processor.test.ts)
class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private _channels: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this._channels = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(ch: number): Float32Array { return this._channels[ch]; }
}
(globalThis as any).AudioBuffer = MockAudioBuffer;

const { decodePlayMode } = _internals;

describe('decodePlayMode round-trip', () => {
  it('every (playmode, reverse) pair from PLAYMODE_CODES decodes to its mode name', () => {
    const modes: SlotPlayMode[] = ['oneshot', 'gate', 'loop', 'gravity', 'revoneshot', 'revgate'];
    for (const mode of modes) {
      const pm = PLAYMODE_CODES[mode];
      const rev = REVERSE_CODES[mode];
      expect(decodePlayMode(pm, rev)).toBe(mode);
    }
  });
});

describe('parseOp1Appl', () => {
  function makeApplBytes(applJson: string): Uint8Array {
    const enc = new TextEncoder();
    const jsonBytes = enc.encode(applJson);
    // Match the encoder shape: 'op-1' signature + 4096-byte JSON block
    const block = new Uint8Array(4 + 4096);
    block.set(enc.encode('op-1'), 0);
    block.fill(0x20, 4); // space-pad
    block.set(jsonBytes, 4);
    return block;
  }

  it('parses a 24-slot APPL JSON and detects empty slots', () => {
    const sampleRate = 44100;
    const slots = Array(24).fill(null) as ({ trimDuration: number; playMode?: SlotPlayMode } | null)[];
    slots[0] = { trimDuration: 0.5, playMode: 'oneshot' };
    slots[1] = { trimDuration: 0.25, playMode: 'loop' };
    slots[5] = { trimDuration: 1.0, playMode: 'revoneshot' };

    const applJson = buildOp1Metadata({ kitName: 'kit-a', deviceMode: 'op1field', slots, sampleRate });
    const applBytes = makeApplBytes(applJson);
    const ingested = parseOp1Appl(applBytes, sampleRate);

    expect(ingested.deviceMode).toBe('op1field');
    expect(ingested.name).toBe('kit-a');
    expect(ingested.slots).toHaveLength(24);

    // Filled slots restored with correct play modes
    expect(ingested.slots[0]?.playMode).toBe('oneshot');
    expect(ingested.slots[1]?.playMode).toBe('loop');
    expect(ingested.slots[5]?.playMode).toBe('revoneshot');

    // Empty slots are null (the 1-frame regions are below the 50ms heuristic)
    expect(ingested.slots[2]).toBeNull();
    expect(ingested.slots[3]).toBeNull();
    expect(ingested.slots[23]).toBeNull();

    // Frame durations are within rounding tolerance
    const slot0Frames = (ingested.slots[0]!.endFrame - ingested.slots[0]!.startFrame);
    expect(Math.abs(slot0Frames - Math.round(0.5 * sampleRate))).toBeLessThan(2);
  });

  it('drum_version 1 → deviceMode op1, drum_version 2 → op1field', () => {
    const slots = Array(24).fill({ trimDuration: 0.1 });
    const sampleRate = 44100;
    const op1Json = buildOp1Metadata({ kitName: 't', deviceMode: 'op1', slots, sampleRate });
    const op1fJson = buildOp1Metadata({ kitName: 't', deviceMode: 'op1field', slots, sampleRate });
    expect(parseOp1Appl(makeApplBytes(op1Json), sampleRate).deviceMode).toBe('op1');
    expect(parseOp1Appl(makeApplBytes(op1fJson), sampleRate).deviceMode).toBe('op1field');
  });

  it('throws when APPL signature is not op-1', () => {
    const bad = new Uint8Array(4 + 16);
    bad.set(new TextEncoder().encode('NOPE'), 0);
    expect(() => parseOp1Appl(bad, 44100)).toThrow(/No OP-1 metadata/);
  });

  it('throws when JSON is corrupt', () => {
    const bad = new Uint8Array(4 + 16);
    bad.set(new TextEncoder().encode('op-1'), 0);
    bad.set(new TextEncoder().encode('{not-json'), 4);
    expect(() => parseOp1Appl(bad, 44100)).toThrow(/Corrupt APPL metadata/);
  });

  it('throws on unrecognized drum_version', () => {
    const json = JSON.stringify({
      drum_version: 99,
      start: Array(24).fill(0),
      end:   Array(24).fill(0),
    });
    expect(() => parseOp1Appl(makeApplBytes(json), 44100)).toThrow(/Unrecognized drum_version/);
  });
});

describe('parseAiff', () => {
  function encodeMinimalAifc(applJson: string | null): Uint8Array {
    const samples = new Float32Array(1024); // 1024 frames of silence
    return encodeAiff({
      sampleRate: 44100,
      numChannels: 1,
      samples,
      applJson: applJson ?? '',
    });
  }

  it('reads a sowt-compressed AIFC with APPL chunk back out', () => {
    const slots = Array(24).fill(null) as ({ trimDuration: number; playMode?: SlotPlayMode } | null)[];
    slots[0] = { trimDuration: 0.5, playMode: 'gravity' };
    const applJson = buildOp1Metadata({ kitName: 'roundtrip', deviceMode: 'op1field', slots, sampleRate: 44100 });
    const aifc = encodeMinimalAifc(applJson);

    // Buffer the typed array into a clean ArrayBuffer
    const buf = aifc.buffer.slice(aifc.byteOffset, aifc.byteOffset + aifc.byteLength);
    const parsed = parseAiff(buf);

    expect(parsed.compressionType).toBe('sowt');
    expect(parsed.numChannels).toBe(1);
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.applData).not.toBeNull();

    // Now parse the APPL we just extracted
    const ingested = parseOp1Appl(parsed.applData!, parsed.sampleRate);
    expect(ingested.name).toBe('roundtrip');
    expect(ingested.deviceMode).toBe('op1field');
    expect(ingested.slots[0]?.playMode).toBe('gravity');
  });
});
