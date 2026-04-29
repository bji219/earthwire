import { SourceRegistry } from './registry.js';
import { createUsgsSequencerSource } from './usgs-sequencer.js';
import { createIssSequencerSource } from './iss-sequencer.js';
import { createEbirdSequencerSource } from './ebird-sequencer.js';
import { createMbariSequencerSource } from './mbari-sequencer.js';
import { createSolarSequencerSource } from './solar-sequencer.js';

export function createDefaultRegistry(): SourceRegistry {
	const registry = new SourceRegistry();
	registry.registerFactory('usgs-earthquakes', () => createUsgsSequencerSource());
	registry.registerFactory('iss-position', () => createIssSequencerSource());
	registry.registerFactory('ebird-activity', () => createEbirdSequencerSource());
	registry.registerFactory('mbari-ocean', () => createMbariSequencerSource());
	registry.registerFactory('solar-wind', () => createSolarSequencerSource());
	return registry;
}

export { SourceRegistry } from './registry.js';
export type { EarthwireSource, SourceField, SourceUpdate, SourceAttribution } from './types.js';
