import { describe, it, expect } from 'vitest';
import { createNormalizer } from './normalizer.js';

describe('normalizer', () => {
  describe('manual mode', () => {
    it('maps value within range to 0-1', () => {
      const norm = createNormalizer({ mode: 'manual', min: 0, max: 10 });
      expect(norm.process(5)).toBeCloseTo(0.5);
      expect(norm.process(0)).toBeCloseTo(0.0);
      expect(norm.process(10)).toBeCloseTo(1.0);
    });

    it('clamps values outside range', () => {
      const norm = createNormalizer({ mode: 'manual', min: 0, max: 10 });
      expect(norm.process(-5)).toBeCloseTo(0.0);
      expect(norm.process(15)).toBeCloseTo(1.0);
    });

    it('handles inverted range', () => {
      const norm = createNormalizer({ mode: 'manual', min: 10, max: 0 });
      expect(norm.process(10)).toBeCloseTo(0.0);
      expect(norm.process(0)).toBeCloseTo(1.0);
    });

    it('handles zero-width range without NaN', () => {
      const norm = createNormalizer({ mode: 'manual', min: 5, max: 5 });
      expect(norm.process(5)).toBeCloseTo(0.5);
    });
  });

  describe('auto mode', () => {
    it('normalizes based on observed min/max', () => {
      const norm = createNormalizer({ mode: 'auto' });
      norm.process(10);
      norm.process(20);
      expect(norm.process(15)).toBeCloseTo(0.5);
    });

    it('returns 0.5 for first value (no range yet)', () => {
      const norm = createNormalizer({ mode: 'auto' });
      expect(norm.process(42)).toBeCloseTo(0.5);
    });

    it('expands range as new extremes arrive', () => {
      const norm = createNormalizer({ mode: 'auto' });
      norm.process(0);
      norm.process(10);
      expect(norm.process(5)).toBeCloseTo(0.5);
      norm.process(20);
      expect(norm.process(10)).toBeCloseTo(0.5);
    });
  });

  describe('reset', () => {
    it('clears auto mode history', () => {
      const norm = createNormalizer({ mode: 'auto' });
      norm.process(0);
      norm.process(100);
      norm.reset();
      expect(norm.process(50)).toBeCloseTo(0.5);
    });
  });
});
