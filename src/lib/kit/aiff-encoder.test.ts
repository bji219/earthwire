import { describe, it, expect } from 'vitest';
import { encodeAiff } from './aiff-encoder';

function makeOptions(overrides = {}) {
  return {
    sampleRate: 44100,
    numChannels: 1,
    bitDepth: 16,
    samples: new Float32Array([0, 0.5, -0.5, 1, -1]),
    applJson: '{"test":1}\0',
    ...overrides,
  };
}

describe('encodeAiff', () => {
  it('starts with FORM chunk', () => {
    const buf = encodeAiff(makeOptions());
    const tag = String.fromCharCode(...buf.slice(0, 4));
    expect(tag).toBe('FORM');
  });

  it('FORM type is AIFF', () => {
    const buf = encodeAiff(makeOptions());
    const type = String.fromCharCode(...buf.slice(8, 12));
    expect(type).toBe('AIFF');
  });

  it('chunk order is COMM then APPL then SSND', () => {
    const buf = encodeAiff(makeOptions());
    const view = new DataView(buf.buffer);
    // Skip FORM header (12 bytes), find chunk tags
    let offset = 12;
    const chunkOrder: string[] = [];
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      chunkOrder.push(tag);
      offset += 8 + size + (size % 2); // chunks are padded to even length
    }
    expect(chunkOrder).toEqual(['COMM', 'APPL', 'SSND']);
  });

  it('COMM chunk has correct numChannels', () => {
    const buf = encodeAiff(makeOptions({ numChannels: 2 }));
    const view = new DataView(buf.buffer);
    // FORM(12) + COMM tag+size(8) = offset 20, numChannels at 20
    expect(view.getInt16(20, false)).toBe(2);
  });

  it('SSND sample data matches input for 16-bit', () => {
    const samples = new Float32Array([0, 1, -1]);
    const buf = encodeAiff(makeOptions({ samples, bitDepth: 16 }));
    // find SSND chunk
    const view = new DataView(buf.buffer);
    let offset = 12;
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      if (tag === 'SSND') {
        // skip 8 bytes offset+blockSize header
        const s0 = view.getInt16(offset + 8 + 8, false);
        const s1 = view.getInt16(offset + 8 + 8 + 2, false);
        const s2 = view.getInt16(offset + 8 + 8 + 4, false);
        expect(s0).toBe(0);
        expect(s1).toBe(32767);
        expect(s2).toBe(-32767);
        return;
      }
      offset += 8 + size + (size % 2);
    }
    throw new Error('SSND chunk not found');
  });

  it('total buffer length is even', () => {
    const buf = encodeAiff(makeOptions());
    expect(buf.length % 2).toBe(0);
  });
});
