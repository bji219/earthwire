import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types.js';

const CACHE_TTL = 15 * 60_000;
const cache = new Map<string, { data: unknown; cachedAt: number }>();

const HEADERS = {
	'X-Earthwire-Source': 'eBird',
	'X-Earthwire-Attribution': 'Cornell Lab of Ornithology'
};

export const GET: RequestHandler = async ({ url }) => {
	const rawRegion = url.searchParams.get('region') || 'US';
	if (!/^[A-Z]{2}(-[A-Z0-9]{1,6})*$/.test(rawRegion)) {
		return json({ error: 'Invalid region code' }, { status: 400 });
	}
	const regionCode = rawRegion;
	const back = Math.min(30, Math.max(1, parseInt(url.searchParams.get('back') || '1', 10)));
	const maxResults = back > 1 ? 200 : 50;

	console.log(`[eBird] request: region=${regionCode} back=${back} maxResults=${maxResults}`);

	const cacheKey = `${regionCode}-${back}`;
	const now = Date.now();
	const cached = cache.get(cacheKey);
	if (cached && now - cached.cachedAt < CACHE_TTL) {
		console.log(`[eBird] cache hit for ${cacheKey}`);
		return json(cached.data, { headers: HEADERS });
	}

	const apiKey = env.EBIRD_API_KEY;
	if (!apiKey) {
		console.warn('[eBird] API key not configured (EBIRD_API_KEY env var missing)');
		return json({ error: 'eBird API key not configured' }, { status: 500 });
	}

	const ebirdUrl = `https://api.ebird.org/v2/data/obs/${regionCode}/recent?maxResults=${maxResults}&back=${back}`;
	console.log(`[eBird] fetching: ${ebirdUrl}`);

	try {
		const res = await fetch(ebirdUrl, {
			headers: { 'X-eBirdApiToken': apiKey }
		});

		console.log(`[eBird] response: status=${res.status}`);

		if (!res.ok) {
			console.warn(`[eBird] API error: ${res.status} ${res.statusText}`);
			return json({ error: 'eBird API unavailable' }, { status: 502 });
		}

		const data = await res.json();
		const count = Array.isArray(data) ? data.length : 0;
		console.log(`[eBird] returning ${count} observations`);

		cache.set(cacheKey, { data, cachedAt: now });
		return json(data, { headers: HEADERS });
	} catch (err) {
		console.error('[eBird] fetch error:', err);
		return json({ error: 'eBird API unavailable' }, { status: 502 });
	}
};
