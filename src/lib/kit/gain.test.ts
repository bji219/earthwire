import { describe, it, expect } from 'vitest';
import {
  applyGain, clampGainDb, dbToLinear,
  GAIN_MIN_DB, GAIN_MAX_DB,
} from './gain.js';

// Same minimal AudioBuffer stand-in the other audio tests use — jsdom has no Web Audio.
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

function makeBuf(channels: number[][], sampleRate = 44100): AudioBuffer {
  const buf = new MockAudioBuffer({
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
  }) as unknown as AudioBuffer;
  channels.forEach((data, ch) => buf.getChannelData(ch).set(data));
  return buf;
}

describe('dbToLinear', () => {
  it('is unity at 0 dB', () => {
    expect(dbToLinear(0)).toBe(1);
  });

  it('halves amplitude at -6 dB and doubles at +6 dB', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 4);
    expect(dbToLinear(6)).toBeCloseTo(1.9953, 4);
  });

  it('quarters amplitude at -12 dB', () => {
    expect(dbToLinear(-12)).toBeCloseTo(0.2512, 4);
  });

  it('reaches about a sixteenth at the -24 dB floor', () => {
    expect(dbToLinear(GAIN_MIN_DB)).toBeCloseTo(0.0631, 4);
  });

  it('is symmetric about zero', () => {
    expect(dbToLinear(9) * dbToLinear(-9)).toBeCloseTo(1, 10);
  });
});

describe('clampGainDb', () => {
  it('passes values inside the range through', () => {
    expect(clampGainDb(0)).toBe(0);
    expect(clampGainDb(-12)).toBe(-12);
    expect(clampGainDb(3)).toBe(3);
  });

  it('holds at both ends', () => {
    expect(clampGainDb(-99)).toBe(GAIN_MIN_DB);
    expect(clampGainDb(99)).toBe(GAIN_MAX_DB);
  });

  it('rounds to whole decibels', () => {
    expect(clampGainDb(-3.4)).toBe(-3);
    expect(clampGainDb(2.6)).toBe(3);
  });

  it('falls back to zero for junk', () => {
    expect(clampGainDb(NaN)).toBe(0);
    expect(clampGainDb(-Infinity)).toBe(0);
  });
});

describe('applyGain', () => {
  it('is a no-op at 0 dB', () => {
    const buf = makeBuf([[0.5, -0.25, 1]]);
    applyGain(buf, 0);
    expect(Array.from(buf.getChannelData(0))).toEqual([0.5, -0.25, 1]);
  });

  it('scales every sample by the linear factor', () => {
    const buf = makeBuf([[1, 0.5, -0.5]]);
    applyGain(buf, -6);
    const f = dbToLinear(-6);
    const out = buf.getChannelData(0);
    expect(out[0]).toBeCloseTo(f, 6);
    expect(out[1]).toBeCloseTo(0.5 * f, 6);
    expect(out[2]).toBeCloseTo(-0.5 * f, 6);
  });

  it('scales every channel, not just the first', () => {
    const buf = makeBuf([[1, 1], [0.5, 0.5]]);
    applyGain(buf, -12);
    const f = dbToLinear(-12);
    expect(buf.getChannelData(0)[0]).toBeCloseTo(f, 6);
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.5 * f, 6);
  });

  it('boosts above full scale without clamping, leaving that to the encoder', () => {
    const buf = makeBuf([[0.9]]);
    applyGain(buf, 6);
    expect(buf.getChannelData(0)[0]).toBeGreaterThan(1);
  });

  it('preserves sign', () => {
    const buf = makeBuf([[-0.8]]);
    applyGain(buf, -6);
    expect(buf.getChannelData(0)[0]).toBeLessThan(0);
  });
});
