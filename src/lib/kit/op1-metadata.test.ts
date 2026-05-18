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
    expect(meta.playmode[0]).toBe(4096);
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
