import { describe, it, expect } from 'vitest';
import { createQuantizer, SCALES } from './quantizer.js';

describe('quantizer', () => {
  it('quantizes continuous value to nearest MIDI note in chromatic scale', () => {
    const q = createQuantizer({ root: 60, scale: 'chromatic' });
    const note = q.process(0.5);
    expect(note).toBeGreaterThanOrEqual(0);
    expect(note).toBeLessThanOrEqual(127);
    expect(Number.isInteger(note)).toBe(true);
  });

  it('returns lowest note for value 0', () => {
    const q = createQuantizer({ root: 60, scale: 'major' });
    const note = q.process(0);
    expect(note).toBe(0);
  });

  it('constrains to major scale intervals', () => {
    const q = createQuantizer({ root: 60, scale: 'major' });
    const note = q.process(60 / 127);
    const majorNotes = new Set<number>();
    for (let oct = 0; oct < 11; oct++) {
      for (const interval of SCALES.major) {
        const n = 12 * oct + interval;
        if (n <= 127) majorNotes.add(n);
      }
    }
    expect(majorNotes.has(note)).toBe(true);
  });

  it('constrains to pentatonic scale', () => {
    const q = createQuantizer({ root: 60, scale: 'pentatonic' });
    const note = q.process(0.5);
    const pentatonicNotes = new Set<number>();
    for (let oct = 0; oct < 11; oct++) {
      for (const interval of SCALES.pentatonic) {
        const n = 12 * oct + interval;
        if (n <= 127) pentatonicNotes.add(n);
      }
    }
    expect(pentatonicNotes.has(note)).toBe(true);
  });

  it('clamps to 0-127 range', () => {
    const q = createQuantizer({ root: 60, scale: 'chromatic' });
    expect(q.process(0.0)).toBeGreaterThanOrEqual(0);
    expect(q.process(1.0)).toBeLessThanOrEqual(127);
  });
});
