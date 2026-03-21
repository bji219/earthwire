import { SourceRegistry } from './registry.js';
import { createUsgsSource } from './usgs.js';
import { createIssSource } from './iss.js';
import { createEbirdSource } from './ebird.js';

export function createDefaultRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.registerFactory('usgs-earthquakes', () => createUsgsSource());
  registry.registerFactory('iss-position', () => createIssSource());
  registry.registerFactory('ebird-activity', () => createEbirdSource());
  return registry;
}

export { SourceRegistry } from './registry.js';
export type { EarthwireSource, SourceField, SourceUpdate, SourceAttribution } from './types.js';
