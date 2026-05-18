import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { patch } from './patch.js';

describe('patch store', () => {
  beforeEach(() => {
    patch.reset();
  });

  it('starts with default patch', () => {
    const p = get(patch);
    expect(p.name).toBe('Untitled Patch');
    expect(p.channels).toHaveLength(0);
    expect(p.specVersion).toBe('0.1.0');
  });

  it('adds a channel', () => {
    patch.addChannel({
      sourceId: 'test',
      fieldId: 'v',
      normalizer: { mode: 'auto' },
      smoother: null,
      quantizer: null,
      threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    });
    expect(get(patch).channels).toHaveLength(1);
  });

  it('removes a channel', () => {
    patch.addChannel({
      sourceId: 'test',
      fieldId: 'v',
      normalizer: { mode: 'auto' },
      smoother: null,
      quantizer: null,
      threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    });
    patch.removeChannel(0);
    expect(get(patch).channels).toHaveLength(0);
  });

  it('exports and imports JSON round-trip', () => {
    patch.addChannel({
      sourceId: 'test',
      fieldId: 'v',
      normalizer: { mode: 'auto' },
      smoother: { amount: 0.5 },
      quantizer: null,
      threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 74 }
    });
    patch.setBpm(140);

    const json = patch.exportJson();
    patch.reset();
    expect(get(patch).channels).toHaveLength(0);

    const success = patch.importJson(json);
    expect(success).toBe(true);
    expect(get(patch).channels).toHaveLength(1);
    expect(get(patch).bpm).toBe(140);
  });

  it('rejects invalid JSON import', () => {
    const success = patch.importJson('not valid json');
    expect(success).toBe(false);
  });
});
