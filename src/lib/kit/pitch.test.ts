import { describe, it, expect } from 'vitest';
import { clampPitch, pitchRate, pitchedDuration, PITCH_MIN, PITCH_MAX } from './pitch.js';

// resampleBuffer is deliberately not tested here: jsdom has no Web Audio, and a
// mocked OfflineAudioContext would assert nothing about real resampling. The
// Playwright pass decodes an exported .aif and checks its frame count instead.

const slot = (trimStart: number, trimEnd: number, pitchSemitones: number) =>
  ({ trimStart, trimEnd, pitchSemitones });

describe('pitchRate', () => {
  it('is 1 at zero', () => {
    expect(pitchRate(0)).toBe(1);
  });

  it('doubles an octave up and halves an octave down', () => {
    expect(pitchRate(12)).toBeCloseTo(2, 10);
    expect(pitchRate(-12)).toBeCloseTo(0.5, 10);
  });

  it('quadruples at two octaves up', () => {
    expect(pitchRate(24)).toBeCloseTo(4, 10);
    expect(pitchRate(-24)).toBeCloseTo(0.25, 10);
  });

  it('gives the equal-tempered ratio for one semitone', () => {
    expect(pitchRate(1)).toBeCloseTo(1.059463, 5);
  });

  it('is symmetric about zero', () => {
    expect(pitchRate(7) * pitchRate(-7)).toBeCloseTo(1, 10);
  });
});

describe('pitchedDuration', () => {
  it('is the trim span when unpitched', () => {
    expect(pitchedDuration(slot(0, 2, 0))).toBeCloseTo(2, 10);
  });

  it('halves an octave up', () => {
    expect(pitchedDuration(slot(0, 2, 12))).toBeCloseTo(1, 10);
  });

  it('doubles an octave down', () => {
    expect(pitchedDuration(slot(0, 2, -12))).toBeCloseTo(4, 10);
  });

  it('measures the trimmed region, not the whole sample', () => {
    expect(pitchedDuration(slot(1.5, 2.5, 12))).toBeCloseTo(0.5, 10);
  });

  it('treats a missing pitch as unpitched, so pre-pitch kits do not yield NaN', () => {
    expect(pitchedDuration({ trimStart: 0, trimEnd: 3 } as any)).toBeCloseTo(3, 10);
  });
});

describe('clampPitch', () => {
  it('passes values inside the range through', () => {
    expect(clampPitch(0)).toBe(0);
    expect(clampPitch(7)).toBe(7);
    expect(clampPitch(-7)).toBe(-7);
  });

  it('holds at both ends', () => {
    expect(clampPitch(99)).toBe(PITCH_MAX);
    expect(clampPitch(-99)).toBe(PITCH_MIN);
    expect(clampPitch(PITCH_MAX)).toBe(PITCH_MAX);
    expect(clampPitch(PITCH_MIN)).toBe(PITCH_MIN);
  });

  it('rounds to whole semitones', () => {
    expect(clampPitch(3.4)).toBe(3);
    expect(clampPitch(-3.6)).toBe(-4);
  });

  it('falls back to zero for junk', () => {
    expect(clampPitch(NaN)).toBe(0);
    expect(clampPitch(Infinity)).toBe(0);
  });
});
