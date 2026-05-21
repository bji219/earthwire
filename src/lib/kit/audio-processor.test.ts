import { describe, it, expect } from 'vitest';
import { trimBuffer, extractPeaks, extractPeaksRange, normalizeBuffer } from './audio-processor.js';

// Minimal AudioBuffer polyfill for Node/Vitest
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

  getChannelData(ch: number): Float32Array {
    return this._channels[ch];
  }
}

// Replace global AudioBuffer with mock during tests
(globalThis as any).AudioBuffer = MockAudioBuffer;

function makeBuf(samples: number[], sampleRate = 44100): AudioBuffer {
  const buf = new MockAudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate }) as unknown as AudioBuffer;
  const ch = buf.getChannelData(0);
  samples.forEach((v, i) => { ch[i] = v; });
  return buf;
}

function makeStereoBuf(left: number[], right: number[], sampleRate = 44100): AudioBuffer {
  const buf = new MockAudioBuffer({ numberOfChannels: 2, length: left.length, sampleRate }) as unknown as AudioBuffer;
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  left.forEach((v, i) => { l[i] = v; });
  right.forEach((v, i) => { r[i] = v; });
  return buf;
}

describe('trimBuffer', () => {
  it('extracts the middle portion of a buffer', () => {
    // 1-second buffer at 100 Hz for easy math: frames 0..99
    const src = makeBuf(Array.from({ length: 100 }, (_, i) => i / 100), 100);
    // Trim frames 25–74 (0.25s – 0.75s), same rate
    const out = trimBuffer(src, 0.25, 0.75, 1, 100);
    expect(out.length).toBe(50);
    expect(out.sampleRate).toBe(100);
    // First sample should be ~0.25
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.25, 2);
    // Last sample should be ~0.74
    expect(out.getChannelData(0)[49]).toBeCloseTo(0.74, 2);
  });

  it('resamples from 48000 to 44100 Hz correctly', () => {
    // Source: 1 second of DC offset 0.5 at 48 kHz
    const src = makeBuf(new Array(48000).fill(0.5), 48000);
    const out = trimBuffer(src, 0, 1, 1, 44100);
    expect(out.sampleRate).toBe(44100);
    expect(out.length).toBe(44100);
    // DC signal should survive unchanged through linear interpolation
    const ch = out.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      expect(ch[i]).toBeCloseTo(0.5, 5);
    }
  });

  it('downmixes stereo to mono by averaging L+R', () => {
    // L = 0.8, R = 0.2 → mono should be 0.5
    const src = makeStereoBuf(new Array(100).fill(0.8), new Array(100).fill(0.2), 100);
    const out = trimBuffer(src, 0, 1, 1, 100);
    const ch = out.getChannelData(0);
    expect(ch[0]).toBeCloseTo(0.5, 5);
  });

  it('passes stereo through unchanged', () => {
    const src = makeStereoBuf(new Array(100).fill(0.6), new Array(100).fill(0.4), 100);
    const out = trimBuffer(src, 0, 1, 2, 100);
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.6, 5);
    expect(out.getChannelData(1)[0]).toBeCloseTo(0.4, 5);
  });

  it('throws on zero-duration trim', () => {
    const src = makeBuf([0.1, 0.2, 0.3], 100);
    expect(() => trimBuffer(src, 0.5, 0.5, 1, 100)).toThrow('Trim duration must be > 0');
  });
});

describe('extractPeaks', () => {
  it('returns numBars values in 0..1', () => {
    const buf = makeBuf(Array.from({ length: 100 }, (_, i) => Math.sin(i)));
    const peaks = extractPeaks(buf, 10);
    expect(peaks).toHaveLength(10);
    peaks.forEach(p => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });
});

describe('normalizeBuffer', () => {
  it('scales a quiet buffer up to targetPeak', () => {
    const buf = makeBuf(new Array(100).fill(0.1), 100) as any;
    normalizeBuffer(buf as AudioBuffer, 0.9);
    const ch = buf.getChannelData(0);
    expect(ch[0]).toBeCloseTo(0.9, 5);
  });

  it('does not amplify near-silence (noise floor protection)', () => {
    const buf = makeBuf(new Array(100).fill(0.00005), 100) as any;
    normalizeBuffer(buf as AudioBuffer, 0.9);
    // peak < 0.0001 threshold — should be left alone
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.00005, 6);
  });

  it('normalizes stereo by global peak across both channels', () => {
    // L peaks at 0.2, R peaks at 0.5 — global peak is 0.5
    const buf = makeStereoBuf(new Array(100).fill(0.2), new Array(100).fill(0.5), 100) as any;
    normalizeBuffer(buf as AudioBuffer, 0.9);
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.36, 3); // 0.2 * (0.9/0.5)
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.9, 5);  // 0.5 * (0.9/0.5)
  });

  it('simulates freesound → local level gap: -15 dBFS → 0 dBFS after normalize', () => {
    // Freesound preview peaks at -15 dBFS ≈ 0.178 linear
    const quietPeak = Math.pow(10, -15 / 20); // ~0.178
    const buf = makeBuf(new Array(100).fill(quietPeak), 100) as any;
    normalizeBuffer(buf as AudioBuffer, 0.9);
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.9, 3);
  });
});

describe('extractPeaksRange', () => {
  it('returns peaks only from the specified subrange', () => {
    // First half = 0, second half = 1
    const samples = [...new Array(50).fill(0), ...new Array(50).fill(1)];
    const buf = makeBuf(samples, 100);
    const peaksFirst = extractPeaksRange(buf, 5, 0, 0.5);
    const peaksSecond = extractPeaksRange(buf, 5, 0.5, 1);
    peaksFirst.forEach(p => expect(p).toBeCloseTo(0, 5));
    peaksSecond.forEach(p => expect(p).toBeCloseTo(1, 5));
  });
});
