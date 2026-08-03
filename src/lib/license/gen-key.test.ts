import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyKey } from './sign.js';

// scripts/gen-key.mjs reimplements the base32 and HMAC logic because plain Node
// cannot import the $lib TypeScript. These tests fail the moment the two drift.
const SECRET = 'test-secret-do-not-ship';

function runGenKey(args: string[]): string {
  return execFileSync('node', ['scripts/gen-key.mjs', ...args], {
    env: { ...process.env, LICENSE_SECRET: SECRET },
    encoding: 'utf8',
  }).trim();
}

function runNewBatch(args: string[], keysDir: string): string {
  return execFileSync('node', ['scripts/new-batch.mjs', ...args], {
    env: { ...process.env, LICENSE_SECRET: SECRET, EARTHWIRE_KEYS_DIR: keysDir },
    encoding: 'utf8',
  });
}

describe('scripts/gen-key.mjs', () => {
  it('issues keys the library accepts', async () => {
    const key = runGenKey(['B01']);
    expect(await verifyKey(key, SECRET)).toEqual({ ok: true, batch: 'B01' });
  });

  it('honours the batch argument', async () => {
    const key = runGenKey(['B0A']);
    expect(await verifyKey(key, SECRET)).toEqual({ ok: true, batch: 'B0A' });
  });

  it('issues a batch of distinct, individually valid keys', async () => {
    const keys = runGenKey(['B02', '5']).split('\n');
    expect(new Set(keys).size).toBe(5);
    for (const key of keys) {
      expect(await verifyKey(key, SECRET)).toEqual({ ok: true, batch: 'B02' });
    }
  });

  it('rejects a malformed batch argument', () => {
    expect(() => runGenKey(['nope'])).toThrow();
    expect(() => runGenKey([])).toThrow();
  });
});

describe('scripts/new-batch.mjs', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'earthwire-keys-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function ledger(): { batch: string; key: string; issued: string }[] {
    return JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'));
  }

  it('issues a key the library accepts and records it', async () => {
    runNewBatch([], dir);
    const rows = ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].batch).toBe('B01');
    expect(await verifyKey(rows[0].key, SECRET)).toEqual({ ok: true, batch: 'B01' });
  });

  it('writes a non-empty PDF for the batch', () => {
    runNewBatch([], dir);
    const pdf = readFileSync(join(dir, 'earthwire-pro-B01.pdf'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('auto-increments the batch id from the ledger', () => {
    runNewBatch([], dir);
    runNewBatch([], dir);
    runNewBatch([], dir);
    expect(ledger().map(r => r.batch)).toEqual(['B01', 'B02', 'B03']);
  });

  it('accepts an explicit batch id', async () => {
    runNewBatch(['B0A'], dir);
    expect(await verifyKey(ledger()[0].key, SECRET)).toEqual({ ok: true, batch: 'B0A' });
  });

  // Reusing an id would put two live keys under one revocation unit.
  it('refuses to reuse a batch id already in the ledger', () => {
    runNewBatch(['B05'], dir);
    expect(() => runNewBatch(['B05'], dir)).toThrow();
  });

  it('rejects a malformed explicit batch id', () => {
    expect(() => runNewBatch(['nope'], dir)).toThrow();
  });
});
