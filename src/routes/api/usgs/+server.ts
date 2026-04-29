import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const USGS_BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

const RANGE_FEEDS: Record<string, string> = {
	hour: `${USGS_BASE}/all_hour.geojson`,
	day: `${USGS_BASE}/all_day.geojson`,
	week: `${USGS_BASE}/all_week.geojson`,
	month: `${USGS_BASE}/all_month.geojson`
};

const CACHE_TTLS: Record<string, number> = {
	hour: 60_000,
	day: 5 * 60_000,
	week: 15 * 60_000,
	month: 30 * 60_000
};

const cache = new Map<string, { data: unknown; cachedAt: number }>();

const HEADERS = {
	'X-Earthwire-Source': 'USGS',
	'X-Earthwire-License': 'Public Domain',
	'X-Earthwire-Attribution': 'U.S. Geological Survey'
};

const FDSNWS_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

const RANGE_DAYS: Record<string, number> = {
	hour: 0, // not used for FDSNWS — use starttime offset
	day: 1,
	week: 7,
	month: 30
};

export const GET: RequestHandler = async ({ url }) => {
	const range = url.searchParams.get('range') || 'hour';
	const lat = url.searchParams.get('lat');
	const lng = url.searchParams.get('lng');
	const radius = url.searchParams.get('radius');
	const ttl = CACHE_TTLS[range] ?? CACHE_TTLS.hour;

	const useGeo = lat && lng;
	const cacheKey = useGeo ? `${range}-${lat}-${lng}-${radius}` : range;

	const now = Date.now();
	const cached = cache.get(cacheKey);
	if (cached && now - cached.cachedAt < ttl) {
		console.log(`[USGS] cache hit for ${cacheKey}`);
		return json(cached.data, { headers: HEADERS });
	}

	let fetchUrl: string;

	if (useGeo) {
		// Use FDSNWS query API for geographic filtering
		const days = RANGE_DAYS[range] ?? 1;
		const startTime = new Date(Date.now() - Math.max(days, 1) * 86400_000).toISOString();
		const radiusKm = parseFloat(radius || '500');
		// FDSNWS uses degrees for radius: 1° ≈ 111.12 km
		const maxRadiusDeg = Math.min(radiusKm / 111.12, 180).toFixed(2);
		fetchUrl = `${FDSNWS_BASE}?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=${radiusKm}&starttime=${startTime}&orderby=time&limit=500`;
		console.log(`[USGS] FDSNWS geo query: lat=${lat} lng=${lng} radius=${radiusKm}km range=${range}`);
	} else {
		fetchUrl = RANGE_FEEDS[range] ?? RANGE_FEEDS.hour;
		console.log(`[USGS] summary feed: ${range}`);
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		const res = await fetch(fetchUrl, { signal: controller.signal });
		clearTimeout(timeout);

		if (!res.ok) {
			console.warn(`[USGS] fetch error: ${res.status}`);
			return json({ error: 'USGS API unavailable' }, { status: 502, headers: HEADERS });
		}

		const data = await res.json();
		cache.set(cacheKey, { data, cachedAt: now });
		console.log(`[USGS] ${data.features?.length ?? 0} features returned`);

		return json(data, { headers: HEADERS });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[USGS] fetch error: ${msg}`);
		return json({ error: `Failed to fetch USGS data: ${msg}` }, { status: 502, headers: HEADERS });
	}
};
