// Shared key minting for the CLI scripts.
//
// This duplicates src/lib/license/{key-format,sign}.ts because plain Node cannot
// import the $lib TypeScript. src/lib/license/gen-key.test.ts runs both scripts
// and verifies their output against the real library — that test is what stops
// the two implementations from drifting into issuing dead keys.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAYLOAD_LEN = 10;
export const SIG_LEN = 6;
export const BATCH_RE = /^B[0-9A-HJKMNP-TV-Z]{2}$/;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

export function loadSecret() {
  if (process.env.LICENSE_SECRET) return process.env.LICENSE_SECRET;

  let contents;
  try {
    contents = readFileSync(resolve(ROOT, '.env'), 'utf8');
  } catch {
    die('LICENSE_SECRET is not set and no .env file was found.');
  }
  const match = contents.match(/^\s*LICENSE_SECRET\s*=\s*(.*)$/m);
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!value) die('LICENSE_SECRET is empty. Generate one with: openssl rand -base64 48');
  return value;
}

export function bytesToBase32(bytes, length) {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31];
    }
    if (out.length >= length) break;
  }
  return out;
}

export async function signPayload(batch, payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${batch}:${payload}`));
  return bytesToBase32(new Uint8Array(sig), SIG_LEN);
}

export async function mintKey(batch, secret) {
  const bytes = new Uint8Array(Math.ceil((PAYLOAD_LEN * 5) / 8));
  crypto.getRandomValues(bytes);
  const payload = bytesToBase32(bytes, PAYLOAD_LEN);
  const sig = await signPayload(batch, payload, secret);
  return ['EW', batch, payload.slice(0, 5), payload.slice(5), sig].join('-');
}

// Batch ids count up through the alphabet in the two trailing characters:
// B00, B01 … B0Z, B10 … BZZ. 1024 batches, ~5,000 sales at 5 per batch.
export function nextBatch(batch) {
  if (!batch) return 'B01';
  const hi = ALPHABET.indexOf(batch[1]);
  const lo = ALPHABET.indexOf(batch[2]);
  if (hi < 0 || lo < 0) die(`cannot increment malformed batch id "${batch}"`);
  const n = hi * 32 + lo + 1;
  if (n > 1023) die('batch id space exhausted (BZZ reached)');
  return `B${ALPHABET[Math.floor(n / 32)]}${ALPHABET[n % 32]}`;
}
