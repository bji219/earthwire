import { SequencerSource } from './sequencer-source.js';
import type { SourceUpdate, TimeRangePreset } from './types.js';
import { log } from '../util/logger.js';

const SOLAR_FIELDS = [
	{ id: 'wind-speed', name: 'Solar Wind Speed', unit: 'km/s', expectedRange: [250, 900] as [number, number] },
	{ id: 'wind-density', name: 'Plasma Density', unit: 'p/cm³', expectedRange: [0, 50] as [number, number] },
	{ id: 'wind-temperature', name: 'Plasma Temperature', unit: 'K', expectedRange: [10000, 500000] as [number, number] },
	{ id: 'flare-intensity', name: 'Solar Flare Class', unit: 'class', expectedRange: [0, 5] as [number, number] }
];

interface PlasmaResult {
	timestamp: number;
	density: number | null;
	speed: number | null;
	temperature: number | null;
}

interface FlareResult {
	timestamp: number;
	intensity: number;
}

export function createSolarSequencerSource(fetchUrl = '/api/solar'): SequencerSource {
	return new SequencerSource({
		id: 'solar-wind',
		name: 'Solar Wind',
		icon: 'sun',
		description: 'Real-time solar wind plasma and solar flare data',
		attribution: {
			provider: 'NOAA Space Weather Prediction Center / NASA DONKI',
			license: 'Public domain',
			url: 'https://www.swpc.noaa.gov/'
		},
		fields: SOLAR_FIELDS,
		async fetchBuffer(timeRange: TimeRangePreset): Promise<SourceUpdate[]> {
			log.source(`Solar fetchBuffer: timeRange=${timeRange}`);
			const updates: SourceUpdate[] = [];

			// Fetch plasma and flares in parallel
			const [plasmaRes, flareRes] = await Promise.all([
				fetchPlasmaData(fetchUrl, timeRange),
				fetchFlareData(fetchUrl, timeRange)
			]);

			updates.push(...plasmaRes, ...flareRes);
			log.source(`Solar fetchBuffer complete: ${updates.length} total updates`);
			return updates;
		}
	});
}

async function fetchPlasmaData(fetchUrl: string, timeRange: TimeRangePreset): Promise<SourceUpdate[]> {
	try {
		const res = await fetch(`${fetchUrl}?type=plasma&range=${timeRange}`);
		if (!res.ok) {
			log.warn(`Solar plasma fetch failed: ${res.status}`);
			return [];
		}
		const data = await res.json();
		const results: PlasmaResult[] = data.results ?? [];
		log.source(`Solar plasma: ${results.length} results`);

		const updates: SourceUpdate[] = [];
		for (const r of results) {
			if (r.speed !== null) {
				updates.push({ timestamp: r.timestamp, fieldId: 'wind-speed', value: r.speed, raw: r });
			}
			if (r.density !== null) {
				updates.push({ timestamp: r.timestamp, fieldId: 'wind-density', value: r.density, raw: r });
			}
			if (r.temperature !== null) {
				updates.push({ timestamp: r.timestamp, fieldId: 'wind-temperature', value: r.temperature, raw: r });
			}
		}
		return updates;
	} catch (err) {
		log.warn(`Solar plasma error: ${err}`);
		return [];
	}
}

async function fetchFlareData(fetchUrl: string, timeRange: TimeRangePreset): Promise<SourceUpdate[]> {
	try {
		const res = await fetch(`${fetchUrl}?type=flares&range=${timeRange}`);
		if (!res.ok) {
			log.warn(`Solar flare fetch failed: ${res.status}`);
			return [];
		}
		const data = await res.json();
		const results: FlareResult[] = data.results ?? [];
		log.source(`Solar flares: ${results.length} results`);

		return results.map(r => ({
			timestamp: r.timestamp,
			fieldId: 'flare-intensity',
			value: r.intensity,
			raw: r
		}));
	} catch (err) {
		log.warn(`Solar flare error: ${err}`);
		return [];
	}
}
