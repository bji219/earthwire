import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const SWPC_PLASMA_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json';
const DONKI_FLARE_URL = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR';

const LIMIT_BY_RANGE: Record<string, number> = {
	hour: 60,
	day: 200,
	week: 500,
	month: 1000
};

const cache = new Map<string, { data: unknown; cachedAt: number }>();
const CACHE_TTL = 15 * 60_000; // 15 minutes

const HEADERS = {
	'X-Earthwire-Source': 'NOAA SWPC / NASA DONKI',
	'X-Earthwire-License': 'Public Domain',
	'X-Earthwire-Attribution': 'NOAA Space Weather Prediction Center, NASA CCMC'
};

/** Convert solar flare class string (e.g. "M1.7", "X2.3") to a numeric value 0-5+ */
function flareClassToNumber(classType: string): number {
	if (!classType) return 0;
	const letter = classType[0].toUpperCase();
	const num = parseFloat(classType.slice(1)) || 1;
	const base: Record<string, number> = { A: 0, B: 1, C: 2, M: 3, X: 4 };
	return (base[letter] ?? 0) + num / 10;
}

export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type') || 'plasma';
	const range = url.searchParams.get('range') || 'day';
	const limit = LIMIT_BY_RANGE[range] ?? 200;

	console.log(`[Solar] request: type=${type} range=${range} limit=${limit}`);

	const cacheKey = `${type}-${range}`;
	const now = Date.now();
	const cached = cache.get(cacheKey);
	if (cached && now - cached.cachedAt < CACHE_TTL) {
		console.log(`[Solar] cache hit for ${cacheKey}`);
		return json(cached.data, { headers: HEADERS });
	}

	try {
		if (type === 'plasma') {
			return await fetchPlasma(limit, cacheKey, now);
		} else if (type === 'flares') {
			return await fetchFlares(range, limit, cacheKey, now);
		}
		return json({ error: 'Unknown type' }, { status: 400 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[Solar] fetch error: ${msg}`);
		return json({ error: `Failed to fetch solar data: ${msg}` }, { status: 502 });
	}
};

async function fetchPlasma(limit: number, cacheKey: string, now: number) {
	console.log(`[Solar] fetching plasma: ${SWPC_PLASMA_URL}`);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15_000);
	const res = await fetch(SWPC_PLASMA_URL, { signal: controller.signal });
	clearTimeout(timeout);

	if (!res.ok) {
		console.warn(`[Solar] SWPC error: ${res.status}`);
		return json({ error: 'SWPC unavailable' }, { status: 502, headers: HEADERS });
	}

	const raw: string[][] = await res.json();
	// First row is headers: ["time_tag", "density", "speed", "temperature"]
	const rows = raw.slice(1);

	console.log(`[Solar] plasma records: ${rows.length}`);

	// Evenly sample to limit
	const step = Math.max(1, Math.floor(rows.length / limit));
	const sampled = rows.filter((_, i) => i % step === 0).slice(0, limit);

	const results = sampled
		.map(([time_tag, density, speed, temperature]) => {
			const timestamp = new Date(time_tag).getTime();
			const d = parseFloat(density);
			const s = parseFloat(speed);
			const t = parseFloat(temperature);
			if (isNaN(timestamp)) return null;
			return { timestamp, density: isNaN(d) ? null : d, speed: isNaN(s) ? null : s, temperature: isNaN(t) ? null : t };
		})
		.filter((r): r is NonNullable<typeof r> => r !== null && (r.density !== null || r.speed !== null));

	console.log(`[Solar] returning ${results.length} plasma results`);
	const data = { type: 'plasma', count: results.length, results };
	cache.set(cacheKey, { data, cachedAt: now });
	return json(data, { headers: HEADERS });
}

async function fetchFlares(range: string, limit: number, cacheKey: string, now: number) {
	const daysBack: Record<string, number> = { hour: 1, day: 7, week: 30, month: 90 };
	const days = daysBack[range] ?? 7;
	const endDate = new Date().toISOString().split('T')[0];
	const startDate = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];

	const flareUrl = `${DONKI_FLARE_URL}?startDate=${startDate}&endDate=${endDate}`;
	console.log(`[Solar] fetching flares: ${flareUrl}`);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15_000);
	const res = await fetch(flareUrl, { signal: controller.signal });
	clearTimeout(timeout);

	if (!res.ok) {
		console.warn(`[Solar] DONKI error: ${res.status}`);
		return json({ error: 'DONKI unavailable' }, { status: 502, headers: HEADERS });
	}

	const flares: any[] = await res.json();
	console.log(`[Solar] flare records: ${flares.length}`);

	const results = flares.slice(0, limit).map((f: any) => ({
		timestamp: new Date(f.peakTime || f.beginTime).getTime(),
		classType: f.classType || '',
		intensity: flareClassToNumber(f.classType || ''),
		sourceLocation: f.sourceLocation || ''
	}));

	const data = { type: 'flares', count: results.length, results };
	cache.set(cacheKey, { data, cachedAt: now });
	return json(data, { headers: HEADERS });
}
