import { describe, it, expect } from 'vitest';
import { generateKey, signPayload, verifyKey } from './sign.js';
import { formatKey, parseKey, SIG_LEN } from './key-format.js';

const SECRET = 'test-secret-do-not-ship';

describe('signPayload', () => {
  it('produces a signature of the expected length', async () => {
    expect(await signPayload('B01', '7KQ4M9XTPZ', SECRET)).toHaveLength(SIG_LEN);
  });

  it('is deterministic', async () => {
    const a = await signPayload('B01', '7KQ4M9XTPZ', SECRET);
    const b = await signPayload('B01', '7KQ4M9XTPZ', SECRET);
    expect(a).toBe(b);
  });

  it('differs by batch and by payload', async () => {
    const base = await signPayload('B01', '7KQ4M9XTPZ', SECRET);
    expect(await signPayload('B02', '7KQ4M9XTPZ', SECRET)).not.toBe(base);
    expect(await signPayload('B01', '7KQ4M9XTPQ', SECRET)).not.toBe(base);
  });
});

describe('verifyKey', () => {
  it('accepts a freshly generated key', async () => {
    const key = await generateKey('B01', SECRET);
    expect(await verifyKey(key, SECRET)).toEqual({ ok: true, batch: 'B01' });
  });

  it('accepts the same key retyped in lowercase without dashes', async () => {
    const key = await generateKey('B01', SECRET);
    const sloppy = key.toLowerCase().replace(/-/g, '');
    expect(await verifyKey(sloppy, SECRET)).toEqual({ ok: true, batch: 'B01' });
  });

  it('rejects a key whose batch segment was edited', async () => {
    const key = await generateKey('B01', SECRET);
    const parsed = parseKey(key)!;
    const tampered = formatKey({ ...parsed, batch: 'B02' });
    expect(await verifyKey(tampered, SECRET)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a key whose payload was edited', async () => {
    const key = await generateKey('B01', SECRET);
    const parsed = parseKey(key)!;
    const swapped = parsed.payload[0] === 'Z' ? 'Y' : 'Z';
    const tampered = formatKey({ ...parsed, payload: swapped + parsed.payload.slice(1) });
    expect(await verifyKey(tampered, SECRET)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a valid key under a different secret', async () => {
    const key = await generateKey('B01', SECRET);
    expect(await verifyKey(key, 'some-other-secret')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports malformed input separately from a bad signature', async () => {
    expect(await verifyKey('not-a-key', SECRET)).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyKey('', SECRET)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a correctly signed key whose batch is revoked', async () => {
    const key = await generateKey('B01', SECRET);
    expect(await verifyKey(key, SECRET, ['B01'])).toEqual({ ok: false, reason: 'revoked' });
  });

  it('leaves other batches usable when one is revoked', async () => {
    const key = await generateKey('B02', SECRET);
    expect(await verifyKey(key, SECRET, ['B01'])).toEqual({ ok: true, batch: 'B02' });
  });
});

describe('verifyKey — per-key revocation', () => {
  it('rejects a correctly signed key on the denylist', async () => {
    const key = await generateKey('B01', SECRET);
    expect(await verifyKey(key, SECRET, [], [key])).toEqual({ ok: false, reason: 'revoked' });
  });

  // The whole point of per-key revocation: burn one leaker, spare the batch.
  it('leaves the other keys in the same batch working', async () => {
    const leaked = await generateKey('B01', SECRET);
    const innocent = await generateKey('B01', SECRET);
    expect(await verifyKey(innocent, SECRET, [], [leaked])).toEqual({ ok: true, batch: 'B01' });
  });

  it('matches a denylist entry written without dashes', async () => {
    const key = await generateKey('B01', SECRET);
    const stripped = key.replace(/-/g, '').toLowerCase();
    expect(await verifyKey(key, SECRET, [], [stripped])).toEqual({ ok: false, reason: 'revoked' });
  });

  it('matches a formatted denylist entry against a sloppily typed key', async () => {
    const key = await generateKey('B01', SECRET);
    const sloppy = key.toLowerCase().replace(/-/g, ' ');
    expect(await verifyKey(sloppy, SECRET, [], [key])).toEqual({ ok: false, reason: 'revoked' });
  });

  it('reports a bad signature rather than revocation for a forged key', async () => {
    const key = await generateKey('B01', SECRET);
    const parsed = parseKey(key)!;
    const forged = formatKey({ ...parsed, sig: parsed.sig === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ' });
    expect(await verifyKey(forged, SECRET, [], [forged])).toEqual({ ok: false, reason: 'invalid' });
  });

  it('ignores the denylist when it does not contain the key', async () => {
    const key = await generateKey('B01', SECRET);
    const other = await generateKey('B01', SECRET);
    expect(await verifyKey(key, SECRET, [], [other])).toEqual({ ok: true, batch: 'B01' });
  });
});

describe('generateKey', () => {
  it('formats keys for printing', async () => {
    const key = await generateKey('B07', SECRET);
    expect(key).toMatch(/^EW-B07-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{6}$/);
  });

  it('never issues the same key twice', async () => {
    const keys = await Promise.all(Array.from({ length: 25 }, () => generateKey('B01', SECRET)));
    expect(new Set(keys).size).toBe(25);
  });
});
