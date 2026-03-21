import { describe, it, expect, vi } from 'vitest';
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
});
