import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types.js';

const CACHE_TTL = 15 * 60_000;

let cachedData: unknown = null;
let cachedAt = 0;

export const GET: RequestHandler = async ({ url }) => {
  const regionCode = url.searchParams.get('region') || 'US';

  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL) {
    return json(cachedData, {
      headers: { 'X-Earthwire-Source': 'eBird', 'X-Earthwire-Attribution': 'Cornell Lab of Ornithology' }
    });
  }

  const apiKey = env.EBIRD_API_KEY;
  if (!apiKey) {
    return json({ error: 'eBird API key not configured' }, { status: 500 });
  }

  const res = await fetch(`https://api.ebird.org/v2/data/obs/${regionCode}/recent?maxResults=50`, {
    headers: { 'X-eBirdApiToken': apiKey }
  });

  if (!res.ok) {
    return json({ error: 'eBird API unavailable' }, { status: 502 });
  }

  cachedData = await res.json();
  cachedAt = now;

  return json(cachedData, {
    headers: { 'X-Earthwire-Source': 'eBird', 'X-Earthwire-Attribution': 'Cornell Lab of Ornithology' }
  });
};
