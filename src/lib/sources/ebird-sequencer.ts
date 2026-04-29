import { SequencerSource } from './sequencer-source.js';
import type { SourceUpdate, TimeRangePreset } from './types.js';
import type { LocationConfig } from '../engine/types.js';
import { log } from '../util/logger.js';

const EBIRD_FIELDS = [
	{ id: 'observation-count', name: 'Individuals', unit: 'birds', expectedRange: [0, 100] as [number, number] },
	{ id: 'species-diversity', name: 'Cumulative Species', unit: 'species', expectedRange: [0, 50] as [number, number] },
	{ id: 'latitude', name: 'Latitude', unit: '°', expectedRange: [-90, 90] as [number, number] }
];

const RANGE_TO_BACK: Record<TimeRangePreset, number> = {
	hour: 1,
	day: 1,
	week: 7,
	month: 30
};

export function parseEbirdForSequencer(data: any[]): SourceUpdate[] {
	const updates: SourceUpdate[] = [];
	const speciesSeen = new Set<string>();

	// Use individual observations as events (not daily aggregates)
	// This gives 50-200 buffer events instead of 1-30
	for (const obs of data) {
		const timestamp = new Date(obs.obsDt).getTime() || Date.now();
		const howMany = obs.howMany || 1;
		speciesSeen.add(obs.speciesCode);

		updates.push(
			{ timestamp, fieldId: 'observation-count', value: howMany, raw: obs },
			{ timestamp, fieldId: 'species-diversity', value: speciesSeen.size, raw: obs },
			{ timestamp, fieldId: 'latitude', value: obs.lat ?? 0, raw: obs }
		);
	}

	return updates;
}

export function createEbirdSequencerSource(fetchUrl = '/api/ebird'): SequencerSource {
	return new SequencerSource({
		id: 'ebird-activity',
		name: 'Bird Activity',
		icon: 'bird',
		description: 'Historical bird observations from Cornell eBird',
		attribution: {
			provider: 'Cornell Lab of Ornithology (eBird)',
			license: 'eBird Terms of Use',
			url: 'https://ebird.org/'
		},
		fields: EBIRD_FIELDS,
		async fetchBuffer(timeRange: TimeRangePreset, location?: LocationConfig) {
			const back = RANGE_TO_BACK[timeRange];
			const region = location?.region ?? 'US';
			log.source(`eBird fetchBuffer: timeRange=${timeRange} back=${back} region=${region}`);

			try {
				const res = await fetch(`${fetchUrl}?back=${back}&region=${region}`);
				if (!res.ok) {
					log.warn(`eBird fetch failed: ${res.status}`);
					return [];
				}
				const data = await res.json();
				if (!Array.isArray(data)) {
					log.warn(`eBird response not an array: ${typeof data}`);
					return [];
				}
				log.source(`eBird: ${data.length} observations received`);
				const updates = parseEbirdForSequencer(data);
				log.source(`eBird: ${updates.length} updates, ${updates.length / 3} buffer events`);
				return updates;
			} catch (err) {
				log.warn(`eBird fetch error: ${err}`);
				return [];
			}
		}
	});
}
