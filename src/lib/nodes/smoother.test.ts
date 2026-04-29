import { describe, it, expect } from 'vitest';
import { createSmoother } from './smoother.js';

describe('smoother — Smooth mode (linear EMA)', () => {
  it('returns raw value when amount is 0', () => {
    const smooth = createSmoother({ mode: 'smooth', amount: 0 });
    expect(smooth.process(1.0)).toBeCloseTo(1.0);
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });

  it('gives known output at amount=0.5', () => {
    const smooth = createSmoother({ mode: 'smooth', amount: 0.5 });
    smooth.process(0.0);
    const r = smooth.process(1.0);
    // alpha = 1 - 0.5 = 0.5, so 0.5*1 + 0.5*0 = 0.5
    expect(r).toBeCloseTo(0.5);
  });

  it('converges toward target over multiple samples', () => {
    const smooth = createSmoother({ mode: 'smooth', amount: 0.5 });
    smooth.process(0.0);
    const r1 = smooth.process(1.0);
    const r2 = smooth.process(1.0);
    const r3 = smooth.process(1.0);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r3).toBeLessThan(1.0);
  });

  it('first sample returns the value directly', () => {
    const smooth = createSmoother({ mode: 'smooth', amount: 0.9 });
    expect(smooth.process(0.7)).toBeCloseTo(0.7);
  });

  it('reset clears state', () => {
    const smooth = createSmoother({ mode: 'smooth', amount: 0.9 });
    smooth.process(1.0);
    smooth.process(1.0);
    smooth.reset();
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });
});

describe('smoother — Deep Smooth mode (exponential EMA)', () => {
  it('returns raw value when amount is 0', () => {
    const smooth = createSmoother({ mode: 'deep-smooth', amount: 0 });
    expect(smooth.process(1.0)).toBeCloseTo(1.0);
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });

  it('smooths values with high amount', () => {
    const smooth = createSmoother({ mode: 'deep-smooth', amount: 0.9 });
    smooth.process(0.0);
    const result = smooth.process(1.0);
    expect(result).toBeGreaterThan(0.0);
    expect(result).toBeLessThan(0.5);
  });

  it('converges toward target over multiple samples', () => {
    const smooth = createSmoother({ mode: 'deep-smooth', amount: 0.5 });
    smooth.process(0.0);
    const r1 = smooth.process(1.0);
    const r2 = smooth.process(1.0);
    const r3 = smooth.process(1.0);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r3).toBeLessThan(1.0);
  });

  it('first sample returns the value directly', () => {
    const smooth = createSmoother({ mode: 'deep-smooth', amount: 0.9 });
    expect(smooth.process(0.7)).toBeCloseTo(0.7);
  });

  it('reset clears state', () => {
    const smooth = createSmoother({ mode: 'deep-smooth', amount: 0.9 });
    smooth.process(1.0);
    smooth.process(1.0);
    smooth.reset();
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });
});

describe('smoother — Glide mode (slew limiter)', () => {
  it('passes through instantly when amount is 0', () => {
    const smooth = createSmoother({ mode: 'glide', amount: 0 });
    expect(smooth.process(0.5)).toBeCloseTo(0.5);
    expect(smooth.process(1.0)).toBeCloseTo(1.0);
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });

  it('limits rate of change', () => {
    const smooth = createSmoother({ mode: 'glide', amount: 0.8 });
    smooth.process(0.0);
    const r = smooth.process(1.0);
    expect(r).toBeGreaterThan(0.0);
    expect(r).toBeLessThan(0.5);
  });

  it('converges at a constant rate', () => {
    const smooth = createSmoother({ mode: 'glide', amount: 0.8 });
    smooth.process(0.0);
    const r1 = smooth.process(1.0);
    const r2 = smooth.process(1.0);
    const r3 = smooth.process(1.0);
    const d1 = r1;
    const d2 = r2 - r1;
    const d3 = r3 - r2;
    expect(d1).toBeCloseTo(d2, 5);
    expect(d2).toBeCloseTo(d3, 5);
  });

  it('first sample returns the value directly', () => {
    const smooth = createSmoother({ mode: 'glide', amount: 1.0 });
    expect(smooth.process(0.7)).toBeCloseTo(0.7);
  });

  it('reset clears state', () => {
    const smooth = createSmoother({ mode: 'glide', amount: 0.8 });
    smooth.process(1.0);
    smooth.process(1.0);
    smooth.reset();
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });
});

describe('smoother — Step mode (sample & hold)', () => {
  it('passes through every tick when amount is 0', () => {
    const smooth = createSmoother({ mode: 'step', amount: 0 });
    expect(smooth.process(0.5)).toBeCloseTo(0.5);
    expect(smooth.process(0.8)).toBeCloseTo(0.8);
    expect(smooth.process(0.2)).toBeCloseTo(0.2);
  });

  it('holds value for multiple ticks', () => {
    const smooth = createSmoother({ mode: 'step', amount: 0.5 });
    const first = smooth.process(0.5);
    expect(first).toBeCloseTo(0.5);
    for (let i = 0; i < 10; i++) {
      expect(smooth.process(0.9)).toBeCloseTo(0.5);
    }
  });

  it('updates after hold duration expires', () => {
    // amount ≈ 0.065 → holdTicks = round(0.065*31)+1 = 3
    const smooth = createSmoother({ mode: 'step', amount: 0.065 });
    smooth.process(0.0);
    smooth.process(1.0);
    smooth.process(1.0);
    const r = smooth.process(1.0);
    expect(r).toBeCloseTo(1.0);
  });

  it('first sample returns the value directly', () => {
    const smooth = createSmoother({ mode: 'step', amount: 1.0 });
    expect(smooth.process(0.7)).toBeCloseTo(0.7);
  });

  it('reset clears state', () => {
    const smooth = createSmoother({ mode: 'step', amount: 0.5 });
    smooth.process(1.0);
    smooth.process(1.0);
    smooth.reset();
    expect(smooth.process(0.0)).toBeCloseTo(0.0);
  });
});

describe('smoother — defaults and legacy', () => {
  it('defaults to Smooth (linear EMA) when mode is undefined', () => {
    const smooth = createSmoother({ amount: 0.5 });
    smooth.process(0.0);
    const r = smooth.process(1.0);
    // Linear: alpha = 0.5, so result = 0.5
    expect(r).toBeCloseTo(0.5);
  });

  it('maps legacy "ema" to deep-smooth', () => {
    const smooth = createSmoother({ mode: 'ema' as any, amount: 0.5 });
    smooth.process(0.0);
    const r = smooth.process(1.0);
    // Exponential: alpha ≈ 0.03, so result is close to 0
    expect(r).toBeGreaterThan(0.0);
    expect(r).toBeLessThan(0.15);
  });

  it('maps legacy "slew" to glide', () => {
    const smooth = createSmoother({ mode: 'slew' as any, amount: 0.8 });
    smooth.process(0.0);
    const r = smooth.process(1.0);
    expect(r).toBeGreaterThan(0.0);
    expect(r).toBeLessThan(0.5);
  });

  it('maps legacy "sample-hold" to step', () => {
    const smooth = createSmoother({ mode: 'sample-hold' as any, amount: 0.5 });
    const first = smooth.process(0.5);
    expect(first).toBeCloseTo(0.5);
    expect(smooth.process(0.9)).toBeCloseTo(0.5);
  });
});
