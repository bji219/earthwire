import { parseUsgsGeoJson } from './usgs.js';
import { SequencerSource } from './sequencer-source.js';
import type { TimeRangePreset } from './types.js';
import type { LocationConfig } from '../engine/types.js';
import { log } from '../util/logger.js';

const USGS_FIELDS = [
	{ id: 'magnitude', name: 'Magnitude', unit: 'magnitude', expectedRange: [0, 10] as [number, number] },
	{ id: 'depth', name: 'Depth', unit: 'km', expectedRange: [0, 700] as [number, number] },
	{ id: 'latitude', name: 'Latitude', unit: 'degrees', expectedRange: [-90, 90] as [number, number] },
	{ id: 'longitude', name: 'Longitude', unit: 'degrees', expectedRange: [-180, 180] as [number, number] }
];

export function createUsgsSequencerSource(fetchUrl = '/api/usgs'): SequencerSource {
	return new SequencerSource({
		id: 'usgs-earthquakes',
		name: 'Earthquakes',
		icon: 'volcano',
		description: 'Historical earthquake data from USGS',
		attribution: {
			provider: 'U.S. Geological Survey (USGS)',
			license: 'Public domain (U.S. Government)',
			url: 'https://earthquake.usgs.gov/'
		},
		fields: USGS_FIELDS,
		async fetchBuffer(timeRange: TimeRangePreset, location?: LocationConfig) {
			let url = `${fetchUrl}?range=${timeRange}`;
			if (location && location.lat !== 0 && location.lng !== 0) {
				url += `&lat=${location.lat}&lng=${location.lng}&radius=${location.radiusKm || 500}`;
				log.source(`USGS fetchBuffer: timeRange=${timeRange} location=${location.lat},${location.lng} radius=${location.radiusKm}km`);
			} else {
				log.source(`USGS fetchBuffer: timeRange=${timeRange} (global)`);
			}
			const res = await fetch(url);
			if (!res.ok) return [];
			const data = await res.json();
			return parseUsgsGeoJson(data);
		}
	});
}
