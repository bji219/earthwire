import { computeIssPosition } from './iss.js';
import { SequencerSource } from './sequencer-source.js';
import type { SourceUpdate, TimeRangePreset } from './types.js';

const ISS_FIELDS = [
	{ id: 'latitude', name: 'Latitude', unit: 'degrees', expectedRange: [-90, 90] as [number, number] },
	{ id: 'longitude', name: 'Longitude', unit: 'degrees', expectedRange: [-180, 180] as [number, number] },
	{ id: 'altitude', name: 'Altitude', unit: 'km', expectedRange: [400, 420] as [number, number] },
	{ id: 'velocity', name: 'Velocity', unit: 'km/s', expectedRange: [7.5, 7.8] as [number, number] }
];

const RANGE_DURATION_MS: Record<TimeRangePreset, number> = {
	hour: 60 * 60 * 1000,
	day: 24 * 60 * 60 * 1000,
	week: 7 * 24 * 60 * 60 * 1000,
	month: 30 * 24 * 60 * 60 * 1000
};

// Target ~500 data points per range for consistent density
const TARGET_POINTS = 500;

export function createIssSequencerSource(fetchUrl = '/api/iss'): SequencerSource {
	let tleLine1 = '';
	let tleLine2 = '';

	return new SequencerSource({
		id: 'iss-position',
		name: 'ISS Position',
		icon: 'telescope',
		description: 'ISS orbital position computed from TLE data',
		attribution: {
			provider: 'CelesTrak / NASA',
			license: 'Public domain',
			url: 'https://celestrak.org/'
		},
		fields: ISS_FIELDS,
		async fetchBuffer(timeRange: TimeRangePreset) {
			// Fetch TLE if we don't have it
			if (!tleLine1 || !tleLine2) {
				const res = await fetch(fetchUrl);
				if (!res.ok) return [];
				const data = await res.json();
				tleLine1 = data.line1;
				tleLine2 = data.line2;
			}

			const durationMs = RANGE_DURATION_MS[timeRange];
			const stepMs = durationMs / TARGET_POINTS;
			const now = Date.now();
			const startTime = now - durationMs;
			const updates: SourceUpdate[] = [];

			for (let t = startTime; t <= now; t += stepMs) {
				try {
					const pos = computeIssPosition(tleLine1, tleLine2, new Date(t));
					const timestamp = Math.round(t);
					updates.push(
						{ timestamp, fieldId: 'latitude', value: pos.latitude, raw: pos },
						{ timestamp, fieldId: 'longitude', value: pos.longitude, raw: pos },
						{ timestamp, fieldId: 'altitude', value: pos.altitude, raw: pos },
						{ timestamp, fieldId: 'velocity', value: pos.velocity, raw: pos }
					);
				} catch {
					// Skip propagation errors for distant timestamps
				}
			}

			return updates;
		}
	});
}
