// Per-slot pitch, baked into the exported audio rather than written to the
// OP-1 APPL `pitch` array.
//
// The metadata route was rejected on purpose: DigiChain's OP-1 -> OP-XY
// converter reads `Math.round((value / 512) / 12)`, which is either 512 or 6144
// units per semitone depending on whether OP-XY's `transpose` is semitones or
// octaves, and no source settles it. Resampling sidesteps the question — the
// device just sees different audio — and lets preview and export share one
// resampling path, so what you audition is what lands on the OP-1.

import type { SlotMeta } from './types.js';

export const PITCH_MIN = -24;
export const PITCH_MAX = 24;
export const PITCH_DEFAULT = 0;

export function clampPitch(semitones: number): number {
  if (!Number.isFinite(semitones)) return PITCH_DEFAULT;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(semitones)));
}

/** Playback rate for a semitone offset. +12 doubles the rate, -12 halves it. */
export function pitchRate(semitones: number): number {
  return 2 ** (semitones / 12);
}

/**
 * How long a slot lasts once pitched. Pitching up shortens the sample, so this
 * is what every duration readout and the device budget must use — the raw trim
 * span is only the source region.
 */
export function pitchedDuration(slot: Pick<SlotMeta, 'trimStart' | 'trimEnd' | 'pitchSemitones'>): number {
  return (slot.trimEnd - slot.trimStart) / pitchRate(slot.pitchSemitones ?? 0);
}

/**
 * Resample through OfflineAudioContext, matching the browser's own resampler.
 * Preview uses playbackRate on a live source node; using the same engine here
 * is what keeps the two identical. Hand-rolled interpolation would alias on
 * pitch-up and silently break that guarantee.
 */
export async function resampleBuffer(buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (rate === 1) return buffer;

  const length = Math.max(1, Math.ceil(buffer.length / rate));
  const Ctor: typeof OfflineAudioContext =
    (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
  const offline = new Ctor(buffer.numberOfChannels, length, buffer.sampleRate);

  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(offline.destination);
  src.start(0);

  const rendered = await offline.startRendering();

  // Copy out per the CLAUDE.md silent-export rule: stored buffers live on the
  // JS heap via `new AudioBuffer`, never a context's own pool.
  const out = new AudioBuffer({
    length: rendered.length,
    numberOfChannels: rendered.numberOfChannels,
    sampleRate: rendered.sampleRate,
  });
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    out.getChannelData(c).set(rendered.getChannelData(c));
  }
  return out;
}
