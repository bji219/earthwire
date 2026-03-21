import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
const CACHE_TTL = 60_000;

let cachedData: unknown = null;
let cachedAt = 0;

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL) {
    return json(cachedData, {
      headers: {
        'X-Earthwire-Source': 'USGS',
        'X-Earthwire-License': 'Public Domain',
        'X-Earthwire-Attribution': 'U.S. Geological Survey'
      }
    });
  }

  const res = await fetch(USGS_URL);
  if (!res.ok) {
    return json({ error: 'USGS API unavailable' }, { status: 502 });
  }

  cachedData = await res.json();
  cachedAt = now;

  return json(cachedData, {
    headers: {
      'X-Earthwire-Source': 'USGS',
      'X-Earthwire-License': 'Public Domain',
      'X-Earthwire-Attribution': 'U.S. Geological Survey'
    }
  });
};
