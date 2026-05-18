import { describe, it, expect } from 'vitest';
import { encodeAiff } from './aiff-encoder';

function makeAppl(): string {
  const json = '{"test":1}';
  const enc = new TextEncoder();
  const bytes = enc.encode(json);
  const block = new Uint8Array(4096);
  block.fill(0x20);
  block.set(bytes);
  return new TextDecoder().decode(block);
}

function makeOptions(overrides = {}) {
  return {
    sampleRate: 44100,
    numChannels: 1,
    samples: new Float32Array([0, 0.5, -0.5, 1, -1]),
    applJson: makeAppl(),
    ...overrides,
  };
}

describe('encodeAiff', () => {
  it('starts with FORM chunk', () => {
    const buf = encodeAiff(makeOptions());
    expect(String.fromCharCode(...buf.slice(0, 4))).toBe('FORM');
  });

  it('FORM type is AIFC', () => {
    const buf = encodeAiff(makeOptions());
    expect(String.fromCharCode(...buf.slice(8, 12))).toBe('AIFC');
  });

  it('chunk order is FVER then COMM then APPL then SSND', () => {
    const buf = encodeAiff(makeOptions());
    const view = new DataView(buf.buffer);
    let offset = 12;
    const chunkOrder: string[] = [];
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      chunkOrder.push(tag);
      offset += 8 + size + (size % 2);
    }
    expect(chunkOrder).toEqual(['FVER', 'COMM', 'APPL', 'SSND']);
  });

  it('COMM chunk has correct numChannels and is 64 bytes', () => {
    const buf = encodeAiff(makeOptions({ numChannels: 2 }));
    const view = new DataView(buf.buffer);
    // FORM(12) + FVER(12) + COMM tag+size(8) → COMM data at offset 32
    const commDataOffset = 12 + 12 + 8;
    expect(view.getInt16(commDataOffset, false)).toBe(2); // numChannels
    expect(view.getUint32(12 + 12 + 4, false)).toBe(64); // COMM chunk size
  });

  it('COMM has sowt compression type', () => {
    const buf = encodeAiff(makeOptions());
    const commDataOffset = 12 + 12 + 8;
    const compType = String.fromCharCode(buf[commDataOffset+18], buf[commDataOffset+19], buf[commDataOffset+20], buf[commDataOffset+21]);
    expect(compType).toBe('sowt');
  });

  it('APPL chunk is exactly 4100 bytes (op-1 + 4096)', () => {
    const buf = encodeAiff(makeOptions());
    const view = new DataView(buf.buffer);
    // FORM(12) + FVER(12) + COMM(8+64=72) + APPL tag(4) + APPL size(4)
    const applSizeOffset = 12 + 12 + 72 + 4;
    expect(view.getUint32(applSizeOffset, false)).toBe(4100);
  });

  it('SSND samples are 16-bit little-endian (sowt)', () => {
    const samples = new Float32Array([0, 1, -1]);
    const buf = encodeAiff(makeOptions({ samples }));
    const view = new DataView(buf.buffer);
    // Find SSND chunk
    let offset = 12;
    while (offset < buf.length - 8) {
      const tag = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const size = view.getUint32(offset + 4, false);
      if (tag === 'SSND') {
        const s0 = view.getInt16(offset + 8 + 8,     true); // little-endian
        const s1 = view.getInt16(offset + 8 + 8 + 2, true);
        const s2 = view.getInt16(offset + 8 + 8 + 4, true);
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
    expect(encodeAiff(makeOptions()).length % 2).toBe(0);
  });
});
