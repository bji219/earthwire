import { bytesToBase32, formatKey, normalizeKey, parseKey, randomPayload, SIG_LEN } from './key-format.js';

// Individual leaked keys. Adding one here and redeploying kills just that key,
// leaving everyone else in its batch working. This is the usual response to a
// key showing up somewhere public.
export const REVOKED_KEYS: readonly string[] = [];

// Whole batches. The blunt instrument — every buyer on the batch needs a
// replacement key afterwards. Reach for REVOKED_KEYS first.
export const REVOKED_BATCHES: readonly string[] = [];

export type VerifyFailure = 'malformed' | 'invalid' | 'revoked';
export type VerifyResult = { ok: true; batch: string } | { ok: false; reason: VerifyFailure };

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export async function signPayload(batch: string, payload: string, secret: string): Promise<string> {
  return bytesToBase32(await hmac(secret, `${batch}:${payload}`), SIG_LEN);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyKey(
  input: string,
  secret: string,
  revokedBatches: readonly string[] = REVOKED_BATCHES,
  revokedKeys: readonly string[] = REVOKED_KEYS,
): Promise<VerifyResult> {
  const parsed = parseKey(input);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const expected = await signPayload(parsed.batch, parsed.payload, secret);
  if (!timingSafeEqual(expected, parsed.sig)) return { ok: false, reason: 'invalid' };

  // Both revocation checks come after the signature so a forged key never
  // reveals which batches or keys are live.
  if (revokedBatches.includes(parsed.batch)) return { ok: false, reason: 'revoked' };

  // Normalize both sides so a denylist entry pasted from a PDF (dashes, mixed
  // case) still matches the key the buyer types.
  const normalized = normalizeKey(input);
  if (revokedKeys.some(k => normalizeKey(k) === normalized)) {
    return { ok: false, reason: 'revoked' };
  }

  return { ok: true, batch: parsed.batch };
}

export async function generateKey(batch: string, secret: string): Promise<string> {
  const payload = randomPayload();
  const sig = await signPayload(batch, payload, secret);
  return formatKey({ batch, payload, sig });
}
