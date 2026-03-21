import { describe, it, expect } from 'vitest';
import { createSmoother } from './smoother.js';

describe('smoother', () => {
  it('returns raw value when amount is 0', () => {
    const smooth = createSmoother({ amount: 0 });
    expect(smooth.process(1.0)).toBeCloseTo(1.0);
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });

  it('smooths values with high amount', () => {
    const smooth = createSmoother({ amount: 0.9 });
    smooth.process(0.0);
    const result = smooth.process(1.0);
    expect(result).toBeGreaterThan(0.0);
    expect(result).toBeLessThan(0.5);
  });

  it('converges toward target over multiple samples', () => {
    const smooth = createSmoother({ amount: 0.5 });
    smooth.process(0.0);
    const r1 = smooth.process(1.0);
    const r2 = smooth.process(1.0);
    const r3 = smooth.process(1.0);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r3).toBeLessThan(1.0);
  });

  it('first sample returns the value directly', () => {
    const smooth = createSmoother({ amount: 0.9 });
    expect(smooth.process(0.7)).toBeCloseTo(0.7);
  });

  it('reset clears state', () => {
    const smooth = createSmoother({ amount: 0.9 });
    smooth.process(1.0);
    smooth.process(1.0);
    smooth.reset();
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });
});
