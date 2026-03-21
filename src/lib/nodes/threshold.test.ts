import { describe, it, expect } from 'vitest';
import { createThreshold } from './threshold.js';

describe('threshold', () => {
  it('fires on rising crossing', () => {
    const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
    expect(t.process(0.3, Date.now())).toBeNull();
    const trigger = t.process(0.6, Date.now());
    expect(trigger).not.toBeNull();
    expect(trigger!.velocity).toBeGreaterThan(0);
  });

  it('does not fire on falling when direction is rising', () => {
    const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
    t.process(0.6, Date.now());
    expect(t.process(0.4, Date.now())).toBeNull();
  });

  it('fires on falling crossing', () => {
    const t = createThreshold({ level: 0.5, direction: 'falling', beatQuantize: null });
    t.process(0.6, Date.now());
    const trigger = t.process(0.4, Date.now());
    expect(trigger).not.toBeNull();
  });

  it('fires on both directions', () => {
    const t = createThreshold({ level: 0.5, direction: 'both', beatQuantize: null });
    expect(t.process(0.3, Date.now())).toBeNull();
    expect(t.process(0.6, Date.now())).not.toBeNull();
    expect(t.process(0.4, Date.now())).not.toBeNull();
  });

  it('does not re-fire without crossing back', () => {
    const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
    t.process(0.3, Date.now());
    t.process(0.6, Date.now());
    expect(t.process(0.7, Date.now())).toBeNull();
  });

  it('velocity reflects distance past threshold', () => {
    const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
    t.process(0.3, Date.now());
    const trigger = t.process(0.9, Date.now());
    expect(trigger!.velocity).toBeGreaterThan(64);
  });

  it('reset clears state', () => {
    const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
    t.process(0.6, Date.now());
    t.reset();
    t.process(0.3, Date.now());
    const trigger = t.process(0.6, Date.now());
    expect(trigger).not.toBeNull();
  });
});
