import { describe, it, expect } from 'vitest';
import { buildOp1Metadata } from './op1-metadata';

describe('buildOp1Metadata', () => {
  const parseResult = (result: string) => JSON.parse(result.trimEnd());

  it('outputs 24-element arrays with correct field types', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const meta = parseResult(result);
    expect(meta.start).toHaveLength(24);
    expect(meta.end).toHaveLength(24);
    expect(meta.pitch).toHaveLength(24);
    expect(meta.volume).toHaveLength(24);
    expect(meta.pan).toHaveLength(24);
    expect(meta.playmode).toHaveLength(24);
    expect(meta.attack).toHaveLength(24);
    expect(meta.pan_ab).toHaveLength(24);
    expect(meta.reverse).toHaveLength(24);
    // playmode must be integers (not strings) — OP-1F firmware uses asInt()
    expect(typeof meta.playmode[0]).toBe('number');
    expect(meta.playmode[0]).toBe(8192); // default 'oneshot'
    expect(meta.pan[0]).toBe(16384);
    expect(meta.stereo).toBe(true);
    expect(meta.octave).toBe(0);
    expect(typeof meta.mtime).toBe('number');
  });

  it('sets drum_version 1 for op1 mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(parseResult(result).drum_version).toBe(1);
  });

  it('sets drum_version 2 and stereo:true for op1field mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const meta = parseResult(result);
    expect(meta.drum_version).toBe(2);
    expect(meta.stereo).toBe(true);
  });

  it('sets stereo:false for op1 mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(parseResult(result).stereo).toBe(false);
  });

  it('calculates start/end as scaled fixed-point (0x7FFFFFFE = full window)', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number })[];
    slots[0] = { trimDuration: 1.0 }; // 44100 frames = 1/20 of the 20s window
    slots[1] = { trimDuration: 0.5 }; // 22050 frames
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots,
      sampleRate: 44100,
    });
    const meta = parseResult(result);
    const MAX = 0x7ffffffe;
    const scale = MAX / (44100 * 20);
    expect(meta.start[0]).toBe(0);
    expect(meta.end[0]).toBe(Math.floor(44100 * scale));
    expect(meta.start[1]).toBe(Math.floor(44100 * scale));
    expect(meta.end[1]).toBe(Math.floor(66150 * scale));
    // 1 second on op1field ≈ 107,374,182
    expect(meta.end[0]).toBeCloseTo(107_374_182, -3);
  });

  it('every slot has start < end — no zero-duration slots', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number })[];
    slots[0]  = { trimDuration: 1.0 };
    slots[5]  = { trimDuration: 0.5 };
    slots[12] = { trimDuration: 0.25 };
    const result = buildOp1Metadata({ kitName: 'test', deviceMode: 'op1field', slots, sampleRate: 44100 });
    const meta = parseResult(result);
    for (let i = 0; i < 24; i++) {
      expect(meta.end[i]).toBeGreaterThan(meta.start[i]);
    }
  });

  it('all (start, end) tuples are unique across 24 slots', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number })[];
    slots[0] = { trimDuration: 1.0 };
    slots[7] = { trimDuration: 0.3 };
    const result = buildOp1Metadata({ kitName: 'test', deviceMode: 'op1field', slots, sampleRate: 44100 });
    const meta = parseResult(result);
    const tuples = new Set(meta.start.map((s: number, i: number) => `${s},${meta.end[i]}`));
    expect(tuples.size).toBe(24);
  });

  it('empty slots occupy unique 1-frame regions immediately after filled audio', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number })[];
    slots[0] = { trimDuration: 1.0 };  // 44100 frames
    const result = buildOp1Metadata({ kitName: 'test', deviceMode: 'op1field', slots, sampleRate: 44100 });
    const meta = parseResult(result);
    const scale = 0x7ffffffe / (44100 * 20);
    const filledFrames = 44100;
    // Slot 1 (first empty) → frame [44100, 44101)
    expect(meta.start[1]).toBe(Math.floor(filledFrames * scale));
    expect(meta.end[1]).toBe(Math.floor((filledFrames + 1) * scale));
    // Slot 23 (last empty, 22 empties before it) → frame [44100+22, 44100+23)
    expect(meta.start[23]).toBe(Math.floor((filledFrames + 22) * scale));
    expect(meta.end[23]).toBe(Math.floor((filledFrames + 23) * scale));
  });

  it('defaults playmode to one-shot (4096) and reverse to forward (12000) for empty slots', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const meta = parseResult(result);
    for (let i = 0; i < 24; i++) {
      expect(meta.playmode[i]).toBe(8192); // oneshot default
      expect(meta.reverse[i]).toBe(12000);
    }
  });

  it('emits per-slot playmode and reverse codes for all six modes', () => {
    const slots = Array(24).fill(null) as (null | { trimDuration: number; playMode?: import('./types').SlotPlayMode })[];
    slots[0] = { trimDuration: 0.5, playMode: 'oneshot' };
    slots[1] = { trimDuration: 0.5, playMode: 'gate' };
    slots[2] = { trimDuration: 0.5, playMode: 'loop' };
    slots[3] = { trimDuration: 0.5, playMode: 'gravity' };
    slots[4] = { trimDuration: 0.5, playMode: 'revoneshot' };
    slots[5] = { trimDuration: 0.5, playMode: 'revgate' };
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots,
      sampleRate: 44100,
    });
    const meta = parseResult(result);

    expect(meta.playmode[0]).toBe(8192);   // oneshot
    expect(meta.playmode[1]).toBe(4096);   // gate
    expect(meta.playmode[2]).toBe(28672);  // loop (0x7000)
    expect(meta.playmode[3]).toBe(20480);  // gravity
    expect(meta.playmode[4]).toBe(12288);  // revoneshot
    expect(meta.playmode[5]).toBe(4096);   // revgate

    expect(meta.reverse[0]).toBe(12000);   // forward
    expect(meta.reverse[1]).toBe(12000);
    expect(meta.reverse[2]).toBe(12000);
    expect(meta.reverse[3]).toBe(12000);
    expect(meta.reverse[4]).toBe(18432);   // reverse
    expect(meta.reverse[5]).toBe(18432);
  });

  it('empty slot end positions never exceed OP1_MAX even when filled frames round up', () => {
    // 16 filled slots near 20s limit + 8 empty slots. Math.round() accumulation
    // can produce 1 extra frame, making safeFilledFrames + 8 > 882000 without the clamp.
    const OP1_MAX = 0x7ffffffe;
    const perSlotFrames = 881993 / 16; // sums to 881993 after Math.round, 1 over budget for 8 empties
    const slotsArr = Array(24).fill(null) as (null | { trimDuration: number })[];
    for (let i = 0; i < 16; i++) slotsArr[i] = { trimDuration: perSlotFrames / 44100 };
    const result = buildOp1Metadata({ kitName: 'test', deviceMode: 'op1field', slots: slotsArr, sampleRate: 44100 });
    const meta = parseResult(result);
    for (let i = 0; i < 24; i++) {
      expect(meta.end[i]).toBeLessThanOrEqual(OP1_MAX);
    }
  });

  it('result is exactly 4096 bytes, space-padded, no null terminator', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    const bytes = new TextEncoder().encode(result);
    expect(bytes.length).toBe(4096);
    expect(result.endsWith(' ')).toBe(true); // space-padded
    // JSON must still be valid when trimmed
    expect(() => JSON.parse(result.trimEnd())).not.toThrow();
  });
});
