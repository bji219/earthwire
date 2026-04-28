import { describe, it, expect } from 'vitest';
import { createLFO } from './lfo.js';

describe('LFO — depth 0 passthrough', () => {
  it('returns input unchanged at depth 0 (sine)', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 0 });
    expect(lfo.process(0.3, 0)).toBeCloseTo(0.3);
    expect(lfo.process(0.7, 0)).toBeCloseTo(0.7);
  });

  it('returns input unchanged at depth 0 (square)', () => {
    const lfo = createLFO({ shape: 'square', rate: 1, depth: 0 });
    expect(lfo.process(0.5, 0)).toBeCloseTo(0.5);
  });
});

describe('LFO — depth 1, sine shape', () => {
  it('at t=0 sine outputs 0.5 (midpoint)', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    expect(lfo.process(0.99, 0)).toBeCloseTo(0.5);
  });

  it('at t=0.25 sine outputs 1.0 (peak)', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.25)).toBeCloseTo(1.0);
  });

  it('at t=0.5 sine outputs 0.5 (zero crossing)', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.5)).toBeCloseTo(0.5);
  });

  it('at t=0.75 sine outputs 0.0 (trough)', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.75)).toBeCloseTo(0.0);
  });
});

describe('LFO — depth 1, triangle shape', () => {
  it('at phase 0 outputs 0', () => {
    const lfo = createLFO({ shape: 'triangle', rate: 1, depth: 1 });
    expect(lfo.process(0, 0)).toBeCloseTo(0);
  });

  it('at phase 0.25 outputs 0.5 (rising)', () => {
    const lfo = createLFO({ shape: 'triangle', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.25)).toBeCloseTo(0.5);
  });

  it('at phase 0.5 outputs 1.0 (peak)', () => {
    const lfo = createLFO({ shape: 'triangle', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.5)).toBeCloseTo(1.0);
  });

  it('at phase 0.75 outputs 0.5 (falling)', () => {
    const lfo = createLFO({ shape: 'triangle', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.75)).toBeCloseTo(0.5);
  });
});

describe('LFO — depth 1, square shape', () => {
  it('phase < 0.5 outputs 1', () => {
    const lfo = createLFO({ shape: 'square', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.1)).toBeCloseTo(1);
  });

  it('phase >= 0.5 outputs 0', () => {
    const lfo = createLFO({ shape: 'square', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.6)).toBeCloseTo(0);
  });
});

describe('LFO — depth 1, saw shape', () => {
  it('at phase 0 outputs 0', () => {
    const lfo = createLFO({ shape: 'saw', rate: 1, depth: 1 });
    expect(lfo.process(0, 0)).toBeCloseTo(0);
  });

  it('at phase 0.5 outputs 0.5', () => {
    const lfo = createLFO({ shape: 'saw', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.5)).toBeCloseTo(0.5);
  });
});

describe('LFO — depth 1, rsaw shape', () => {
  it('at phase 0 outputs 1', () => {
    const lfo = createLFO({ shape: 'rsaw', rate: 1, depth: 1 });
    expect(lfo.process(0, 0)).toBeCloseTo(1);
  });

  it('at phase 0.5 outputs 0.5', () => {
    const lfo = createLFO({ shape: 'rsaw', rate: 1, depth: 1 });
    lfo.process(0, 0);
    expect(lfo.process(0, 0.5)).toBeCloseTo(0.5);
  });
});

describe('LFO — depth blend', () => {
  it('depth 0.5 blends input and LFO', () => {
    // sine at phase=0 → osc=0.5; input=0; lerp(0, 0.5, 0.5) = 0.25
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 0.5 });
    expect(lfo.process(0, 0)).toBeCloseTo(0.25);
  });
});

describe('LFO — rate', () => {
  it('rate=2 at t=0.5 produces same phase as rate=1 at t=1.0', () => {
    const lfo2 = createLFO({ shape: 'sine', rate: 2, depth: 1 });
    lfo2.process(0, 0);
    const v2 = lfo2.process(0, 0.5);

    const lfo1 = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    lfo1.process(0, 0);
    const v1 = lfo1.process(0, 1.0);

    expect(v2).toBeCloseTo(v1);
  });
});

describe('LFO — reset', () => {
  it('reset restarts phase so next call behaves like t=0', () => {
    const lfo = createLFO({ shape: 'sine', rate: 1, depth: 1 });
    const v1 = lfo.process(0, 0);
    lfo.process(0, 0.25);
    lfo.reset();
    const v2 = lfo.process(0, 0);
    expect(v1).toBeCloseTo(v2);
  });
});
