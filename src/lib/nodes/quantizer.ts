import type { QuantizerConfig, ScaleName } from './types.js';

export const SCALES: Record<ScaleName, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

export interface Quantizer {
  process(normalizedValue: number): number;
}

export function createQuantizer(config: QuantizerConfig): Quantizer {
  const scaleNotes = buildScaleNotes(config.scale);

  function process(normalizedValue: number): number {
    const rawNote = Math.round(normalizedValue * 127);
    const clamped = Math.max(0, Math.min(127, rawNote));
    return snapToScale(clamped, scaleNotes);
  }

  return { process };
}

function buildScaleNotes(scale: ScaleName): number[] {
  const intervals = SCALES[scale];
  const notes: number[] = [];
  for (let octave = 0; octave < 11; octave++) {
    for (const interval of intervals) {
      const note = octave * 12 + interval;
      if (note <= 127) notes.push(note);
    }
  }
  return notes;
}

function snapToScale(note: number, scaleNotes: number[]): number {
  let closest = scaleNotes[0];
  let minDist = Math.abs(note - closest);
  for (const sn of scaleNotes) {
    const dist = Math.abs(note - sn);
    if (dist < minDist) {
      minDist = dist;
      closest = sn;
    }
  }
  return closest;
}
