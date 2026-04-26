import { describe, it, expect } from 'vitest';
import { buildOp1Metadata } from './op1-metadata';

describe('buildOp1Metadata', () => {
  const parseResult = (result: string) => JSON.parse(result.replace(/\0+$/, ''));

  it('outputs 24-element arrays', () => {
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

  it('sets drum_version 2 for op1field mode', () => {
    const result = buildOp1Metadata({
      kitName: 'test',
      deviceMode: 'op1field',
      slots: Array(24).fill(null),
      sampleRate: 44100,
    });
    expect(parseResult(result).drum_version).toBe(2);
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
    const meta = parseResult(result);
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
    const meta = parseResult(result);
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
