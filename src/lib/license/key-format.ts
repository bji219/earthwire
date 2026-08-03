// Crockford base32 — no I, L, O or U, so keys survive being retyped off a PDF.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const PREFIX = 'EW';
export const BATCH_LEN = 3; // 'B' + two alphabet chars
export const PAYLOAD_LEN = 10;
export const SIG_LEN = 6;

const RAW_LEN = PREFIX.length + BATCH_LEN + PAYLOAD_LEN + SIG_LEN;

export interface ParsedKey {
  batch: string;
  payload: string;
  sig: string;
}

// Glyphs excluded from the alphabet, mapped to what the reader most likely meant.
const CONFUSABLES: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

export function normalizeKey(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    const mapped = CONFUSABLES[ch] ?? ch;
    if (mapped >= '0' && mapped <= '9') out += mapped;
    else if (mapped >= 'A' && mapped <= 'Z') out += mapped;
  }
  return out;
}

function isAlphabet(s: string): boolean {
  for (const ch of s) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export function parseKey(input: string): ParsedKey | null {
  const raw = normalizeKey(input);
  if (raw.length !== RAW_LEN) return null;
  if (!raw.startsWith(PREFIX)) return null;

  const batch = raw.slice(PREFIX.length, PREFIX.length + BATCH_LEN);
  const payload = raw.slice(PREFIX.length + BATCH_LEN, PREFIX.length + BATCH_LEN + PAYLOAD_LEN);
  const sig = raw.slice(PREFIX.length + BATCH_LEN + PAYLOAD_LEN);

  if (!batch.startsWith('B') || !isAlphabet(batch.slice(1))) return null;
  if (!isAlphabet(payload) || !isAlphabet(sig)) return null;

  return { batch, payload, sig };
}

export function formatKey({ batch, payload, sig }: ParsedKey): string {
  return [PREFIX, batch, payload.slice(0, 5), payload.slice(5), sig].join('-');
}

export function bytesToBase32(bytes: Uint8Array, length: number): string {
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

export function randomPayload(): string {
  const bytes = new Uint8Array(Math.ceil((PAYLOAD_LEN * 5) / 8));
  crypto.getRandomValues(bytes);
  return bytesToBase32(bytes, PAYLOAD_LEN);
}
