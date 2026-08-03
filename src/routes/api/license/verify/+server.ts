import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyKey } from '$lib/license/sign.js';
import type { RequestHandler } from './$types';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 12;

// Per-instance only — Vercel runs several, so this throttles casual scripting
// rather than a determined attacker. Key entropy is what actually protects us.
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const secret = env.LICENSE_SECRET;
  if (!secret) {
    throw error(500, 'License verification is not configured on this server.');
  }

  if (rateLimited(getClientAddress())) {
    return json({ ok: false, reason: 'throttled' }, { status: 429 });
  }

  let key: unknown;
  try {
    ({ key } = await request.json());
  } catch {
    return json({ ok: false, reason: 'malformed' }, { status: 400 });
  }

  if (typeof key !== 'string' || key.length > 200) {
    return json({ ok: false, reason: 'malformed' }, { status: 400 });
  }

  const result = await verifyKey(key, secret);
  if (!result.ok) return json(result, { status: 400 });

  return json(result);
};
