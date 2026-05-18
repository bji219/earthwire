import { describe, it, expect } from 'vitest';
import { EarthwireEngine } from './engine.js';
import type { ChannelConfig } from './types.js';

describe('EarthwireEngine', () => {
  it('processes a raw value through normalizer only', () => {
    const engine = new EarthwireEngine();
    const channel: ChannelConfig = {
      sourceId: 'test', fieldId: 'value',
      normalizer: { mode: 'manual', min: 0, max: 100 },
      smoother: null, quantizer: null, threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    };
    engine.addChannel(channel);
    const output = engine.processValue(0, 50);
    expect(output.continuous).toBeCloseTo(0.5);
    expect(output.trigger).toBeNull();
  });

  it('chains normalizer and smoother', () => {
    const engine = new EarthwireEngine();
    const channel: ChannelConfig = {
      sourceId: 'test', fieldId: 'value',
      normalizer: { mode: 'manual', min: 0, max: 100 },
      smoother: { amount: 0.5 },
      quantizer: null, threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    };
    engine.addChannel(channel);
    engine.processValue(0, 0);
    const output = engine.processValue(0, 100);
    expect(output.continuous).toBeGreaterThan(0);
    expect(output.continuous).toBeLessThan(1);
  });

  it('manages multiple channels independently', () => {
    const engine = new EarthwireEngine();
    engine.addChannel({
      sourceId: 'a', fieldId: 'v',
      normalizer: { mode: 'manual', min: 0, max: 10 },
      smoother: null, quantizer: null, threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    });
    engine.addChannel({
      sourceId: 'b', fieldId: 'v',
      normalizer: { mode: 'manual', min: 0, max: 100 },
      smoother: null, quantizer: null, threshold: null,
      output: { type: 'midi-cc', channel: 2, cc: 2 }
    });
    const out0 = engine.processValue(0, 5);
    const out1 = engine.processValue(1, 50);
    expect(out0.continuous).toBeCloseTo(0.5);
    expect(out1.continuous).toBeCloseTo(0.5);
  });

  it('removes a channel', () => {
    const engine = new EarthwireEngine();
    engine.addChannel({
      sourceId: 'a', fieldId: 'v',
      normalizer: { mode: 'manual', min: 0, max: 10 },
      smoother: null, quantizer: null, threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    });
    expect(engine.channelCount).toBe(1);
    engine.removeChannel(0);
    expect(engine.channelCount).toBe(0);
  });

  it('processes quantizer in chain', () => {
    const engine = new EarthwireEngine();
    engine.addChannel({
      sourceId: 'test', fieldId: 'value',
      normalizer: { mode: 'manual', min: 0, max: 127 },
      smoother: null,
      quantizer: { root: 60, scale: 'major' },
      threshold: null,
      output: { type: 'midi-note', channel: 1 }
    });
    const output = engine.processValue(0, 60);
    expect(output.note).not.toBeNull();
    expect(Number.isInteger(output.note)).toBe(true);
  });

  it('processes threshold and emits trigger', () => {
    const engine = new EarthwireEngine();
    engine.addChannel({
      sourceId: 'test', fieldId: 'value',
      normalizer: { mode: 'manual', min: 0, max: 100 },
      smoother: null,
      quantizer: null,
      threshold: { level: 0.5, direction: 'rising', beatQuantize: null },
      output: { type: 'midi-trigger', channel: 1, note: 60 }
    });
    engine.processValue(0, 30);
    const output = engine.processValue(0, 80);
    expect(output.trigger).not.toBeNull();
  });
});
