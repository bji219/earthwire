import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const CACHE_TTL = 3600_000;

let cachedTle: { line1: string; line2: string } | null = null;
let cachedAt = 0;

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (cachedTle && now - cachedAt < CACHE_TTL) {
    return json(cachedTle, {
      headers: { 'X-Earthwire-Source': 'CelesTrak', 'X-Earthwire-Attribution': 'CelesTrak / NASA' }
    });
  }

  const res = await fetch(CELESTRAK_URL);
  if (!res.ok) {
    return json({ error: 'CelesTrak API unavailable' }, { status: 502 });
  }

  const text = await res.text();
  const lines = text.trim().split('\n').map((l) => l.trim());
  if (lines.length < 3) {
    return json({ error: 'Invalid TLE response' }, { status: 502 });
  }

  cachedTle = { line1: lines[1], line2: lines[2] };
  cachedAt = now;

  return json(cachedTle, {
    headers: { 'X-Earthwire-Source': 'CelesTrak', 'X-Earthwire-Attribution': 'CelesTrak / NASA' }
  });
};
