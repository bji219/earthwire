import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  bytesToBase32,
  formatKey,
  normalizeKey,
  parseKey,
  randomPayload,
  PAYLOAD_LEN,
} from './key-format.js';

const VALID = 'EW-B01-7KQ4M-9XTPZ-A3F8QW';

describe('normalizeKey', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeKey('ew-b01-7kq4m-9xtpz-a3f8qw')).toBe('EWB017KQ4M9XTPZA3F8QW');
  });

  it('tolerates missing dashes and stray whitespace', () => {
    expect(normalizeKey('  EW B01 7KQ4M9XTPZ A3F8QW ')).toBe(normalizeKey(VALID));
  });

  it('maps confusable glyphs onto the alphabet', () => {
    expect(normalizeKey('EW-BO1-7KQ4M-9XTPZ-A3F8QW')).toBe(normalizeKey(VALID));
    expect(normalizeKey('III')).toBe('111');
    expect(normalizeKey('LOU')).toBe('10V');
  });
});

describe('parseKey', () => {
  it('splits a valid key into batch, payload and signature', () => {
    expect(parseKey(VALID)).toEqual({ batch: 'B01', payload: '7KQ4M9XTPZ', sig: 'A3F8QW' });
  });

  it('parses a key typed without dashes identically', () => {
    expect(parseKey('ewb017kq4m9xtpza3f8qw')).toEqual(parseKey(VALID));
  });

  it('rejects wrong length', () => {
    expect(parseKey('EW-B01-7KQ4M-9XTPZ-A3F8Q')).toBeNull();
    expect(parseKey(VALID + 'X')).toBeNull();
  });

  it('rejects a wrong prefix', () => {
    expect(parseKey('XW-B01-7KQ4M-9XTPZ-A3F8QW')).toBeNull();
  });

  it('rejects a batch that does not start with B', () => {
    expect(parseKey('EW-C01-7KQ4M-9XTPZ-A3F8QW')).toBeNull();
  });

  it('rejects the empty string', () => {
    expect(parseKey('')).toBeNull();
  });
});

describe('formatKey', () => {
  it('round-trips through parseKey', () => {
    const parsed = parseKey(VALID)!;
    expect(formatKey(parsed)).toBe(VALID);
  });
});

describe('bytesToBase32', () => {
  it('emits only alphabet characters', () => {
    const out = bytesToBase32(new Uint8Array([255, 128, 0, 17, 200, 3, 99]), 10);
    expect(out).toHaveLength(10);
    for (const ch of out) expect(ALPHABET).toContain(ch);
  });

  it('is deterministic for the same bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bytesToBase32(bytes, 6)).toBe(bytesToBase32(bytes, 6));
  });
});

describe('randomPayload', () => {
  it('produces payloads of the right length and alphabet', () => {
    const payload = randomPayload();
    expect(payload).toHaveLength(PAYLOAD_LEN);
    for (const ch of payload) expect(ALPHABET).toContain(ch);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => randomPayload()));
    expect(seen.size).toBe(50);
  });
});
