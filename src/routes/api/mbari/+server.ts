import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const STOQS_BASE = 'https://stoqs.mbari.org/stoqs_canon_may2018/api';

// Map our field names to STOQS parameter IDs (from /api/parameter.json)
const PARAM_IDS: Record<string, number> = {
	'depth-temperature': 13,
	'depth-salinity': 14,
	'depth-oxygen': 15,
	'chlorophyll': 68,
	'fluorescence': 12,
	'nitrate': 46
};

const LIMIT_BY_RANGE: Record<string, number> = {
	hour: 50,
	day: 200,
	week: 500,
	month: 1000
};

const cache = new Map<string, { data: unknown; cachedAt: number }>();
const CACHE_TTL = 30 * 60_000; // 30 minutes

const HEADERS = {
	'X-Earthwire-Source': 'MBARI STOQS',
	'X-Earthwire-License': 'Public Access',
	'X-Earthwire-Attribution': 'Monterey Bay Aquarium Research Institute'
};

interface SimpleDepthtimeRecord {
	epochmilliseconds: number;
	depth: number;
}

export const GET: RequestHandler = async ({ url }) => {
	const parameter = url.searchParams.get('parameter') || 'depth-temperature';
	const range = url.searchParams.get('range') || 'day';
	const paramId = PARAM_IDS[parameter] ?? 13;
	const limit = LIMIT_BY_RANGE[range] ?? 200;

	console.log(`[MBARI] request: parameter=${parameter} range=${range} paramId=${paramId} limit=${limit}`);

	const cacheKey = `${parameter}-${range}`;
	const now = Date.now();
	const cached = cache.get(cacheKey);
	if (cached && now - cached.cachedAt < CACHE_TTL) {
		console.log(`[MBARI] cache hit for ${cacheKey}`);
		return json(cached.data, { headers: HEADERS });
	}

	try {
		// Use simpledepthtime endpoint — lightweight, returns depth + timestamp
		const apiUrl = `${STOQS_BASE}/simpledepthtime.json?parameter__id=${paramId}&limit=${limit}&format=json`;
		console.log(`[MBARI] fetching: ${apiUrl}`);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30_000); // STOQS returns ~5MB, needs time

		const res = await fetch(apiUrl, {
			headers: { Accept: 'application/json' },
			signal: controller.signal
		});
		clearTimeout(timeout);

		console.log(`[MBARI] response: status=${res.status}`);

		if (!res.ok) {
			console.warn(`[MBARI] STOQS API error: ${res.status} ${res.statusText}`);
			return json({ error: 'STOQS API unavailable', status: res.status }, { status: 502 });
		}

		// STOQS returns NaN values in JSON (invalid JSON) — sanitize before parsing
		const rawText = await res.text();
		const sanitized = rawText.replace(/\bNaN\b/g, 'null');
		const raw = JSON.parse(sanitized);
		console.log(`[MBARI] response body: ${rawText.length} bytes, sanitized NaN → null`);

		// simpledepthtime returns an array of records with epochmilliseconds and depth
		// STOQS ignores the limit param — returns full dataset (~5MB)
		// Data has many depth levels per timestamp, so we sample across unique timestamps
		const allRecords: SimpleDepthtimeRecord[] = Array.isArray(raw) ? raw : (raw.objects ?? raw.results ?? []);

		console.log(`[MBARI] raw records: ${allRecords.length}`);

		// Group by timestamp, pick median depth per timestamp for a time-series
		const byTimestamp = new Map<number, number[]>();
		for (const rec of allRecords) {
			const ts = rec.epochmilliseconds;
			const depth = rec.depth;
			if (ts != null && depth != null) {
				const tsNum = typeof ts === 'number' ? ts : parseFloat(String(ts));
				const depthNum = typeof depth === 'number' ? depth : parseFloat(String(depth));
				if (!isNaN(tsNum) && !isNaN(depthNum)) {
					const existing = byTimestamp.get(tsNum);
					if (existing) existing.push(depthNum);
					else byTimestamp.set(tsNum, [depthNum]);
				}
			}
		}

		// Sort timestamps and evenly sample up to `limit` timestamps
		const sortedTimestamps = Array.from(byTimestamp.keys()).sort((a, b) => a - b);
		const step = Math.max(1, Math.floor(sortedTimestamps.length / limit));
		const sampledTimestamps = sortedTimestamps.filter((_, i) => i % step === 0).slice(0, limit);

		const results: Array<{ timestamp: number; value: number; depth: number }> = [];
		for (const ts of sampledTimestamps) {
			const depths = byTimestamp.get(ts)!;
			// Pick median depth as representative value
			depths.sort((a, b) => a - b);
			const median = depths[Math.floor(depths.length / 2)];
			results.push({
				timestamp: ts,
				value: Math.abs(median),
				depth: median
			});
		}

		console.log(`[MBARI] ${sortedTimestamps.length} unique timestamps, sampled ${results.length}`);

		console.log(`[MBARI] returning ${results.length} results for ${parameter}`);
		const data = { parameter, count: results.length, results };
		cache.set(cacheKey, { data, cachedAt: now });

		return json(data, { headers: HEADERS });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[MBARI] fetch error: ${msg}`, err);
		return json({ error: `Failed to fetch STOQS data: ${msg}` }, { status: 502 });
	}
};
