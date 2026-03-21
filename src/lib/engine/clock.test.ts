import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BpmClock } from './clock.js';

describe('BpmClock', () => {
  it('initializes with default BPM', () => {
    const clock = new BpmClock();
    expect(clock.bpm).toBe(120);
  });

  it('allows setting BPM', () => {
    const clock = new BpmClock(140);
    expect(clock.bpm).toBe(140);
    clock.bpm = 90;
    expect(clock.bpm).toBe(90);
  });

  it('calculates beat duration in ms', () => {
    const clock = new BpmClock(120);
    expect(clock.beatDurationMs).toBeCloseTo(500);
  });

  it('calculates subdivision duration', () => {
    const clock = new BpmClock(120);
    expect(clock.subdivisionMs('1/4')).toBeCloseTo(500);
    expect(clock.subdivisionMs('1/8')).toBeCloseTo(250);
    expect(clock.subdivisionMs('1/16')).toBeCloseTo(125);
  });

  it('quantizes a timestamp to the nearest subdivision', () => {
    const clock = new BpmClock(120);
    clock.startTime = 0;
    expect(clock.quantize(240, '1/4')).toBe(500);
    expect(clock.quantize(260, '1/4')).toBe(500);
    expect(clock.quantize(100, '1/4')).toBe(0);
  });

  it('returns null subdivision duration for null', () => {
    const clock = new BpmClock(120);
    expect(clock.subdivisionMs(null)).toBeNull();
  });
});
