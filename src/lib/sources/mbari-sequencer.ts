import { SequencerSource } from './sequencer-source.js';
import type { SourceUpdate, TimeRangePreset } from './types.js';
import { log } from '../util/logger.js';

const MBARI_FIELDS = [
	{ id: 'depth-temperature', name: 'Depth (Temperature)', unit: 'm', expectedRange: [0, 500] as [number, number] },
	{ id: 'depth-salinity', name: 'Depth (Salinity)', unit: 'm', expectedRange: [0, 500] as [number, number] },
	{ id: 'depth-oxygen', name: 'Depth (Oxygen)', unit: 'm', expectedRange: [0, 500] as [number, number] },
	{ id: 'chlorophyll', name: 'Chlorophyll', unit: 'µg/l', expectedRange: [0, 500] as [number, number] },
	{ id: 'fluorescence', name: 'Fluorescence', unit: 'µg/L', expectedRange: [0, 500] as [number, number] },
	{ id: 'nitrate', name: 'Nitrate', unit: 'µmol/kg', expectedRange: [0, 500] as [number, number] }
];

interface MbariResult {
	timestamp: number;
	value: number;
	depth: number;
}

export function createMbariSequencerSource(fetchUrl = '/api/mbari'): SequencerSource {
	return new SequencerSource({
		id: 'mbari-ocean',
		name: 'MBARI Ocean',
		icon: 'ocean',
		description: 'Ocean depth profiles from MBARI STOQS (Monterey Bay)',
		attribution: {
			provider: 'Monterey Bay Aquarium Research Institute (MBARI)',
			license: 'Public access',
			url: 'https://stoqs.mbari.org/'
		},
		fields: MBARI_FIELDS,
		async fetchBuffer(timeRange: TimeRangePreset): Promise<SourceUpdate[]> {
			log.source(`MBARI fetchBuffer: timeRange=${timeRange}, fetching ${MBARI_FIELDS.length} fields in parallel`);

			// Fetch all fields in parallel instead of sequentially
			const fetches = MBARI_FIELDS.map(async (field) => {
				try {
					const url = `${fetchUrl}?parameter=${field.id}&range=${timeRange}`;
					log.source(`MBARI fetch: ${field.id} → ${url}`);
					const res = await fetch(url);
					if (!res.ok) {
						log.warn(`MBARI fetch failed for ${field.id}: ${res.status}`);
						return [];
					}
					const data = await res.json();
					const results: MbariResult[] = data.results ?? [];
					log.source(`MBARI ${field.id}: ${results.length} results`);
					return results.map(r => ({
						fieldId: field.id,
						value: r.value,
						timestamp: r.timestamp,
						raw: r
					}));
				} catch (err) {
					log.warn(`MBARI fetch error for ${field.id}: ${err}`);
					return [];
				}
			});

			const allResults = await Promise.all(fetches);
			const updates: SourceUpdate[] = [];
			for (const batch of allResults) {
				updates.push(...batch);
			}

			log.source(`MBARI fetchBuffer complete: ${updates.length} total updates`);
			return updates;
		}
	});
}
