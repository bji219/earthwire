import type { EarthwireSource, SourceField, SourceUpdate } from './types.js';

const USGS_FIELDS: SourceField[] = [
  { id: 'magnitude', name: 'Magnitude', unit: 'magnitude', expectedRange: [0, 10] },
  { id: 'depth', name: 'Depth', unit: 'km', expectedRange: [0, 700] },
  { id: 'latitude', name: 'Latitude', unit: 'degrees', expectedRange: [-90, 90] },
  { id: 'longitude', name: 'Longitude', unit: 'degrees', expectedRange: [-180, 180] }
];

export function parseUsgsGeoJson(data: any): SourceUpdate[] {
  const updates: SourceUpdate[] = [];
  for (const feature of data.features) {
    const { mag, time } = feature.properties;
    const [lon, lat, depth] = feature.geometry.coordinates;
    const raw = feature;
    updates.push(
      { timestamp: time, fieldId: 'magnitude', value: mag, raw },
      { timestamp: time, fieldId: 'depth', value: depth, raw },
      { timestamp: time, fieldId: 'latitude', value: lat, raw },
      { timestamp: time, fieldId: 'longitude', value: lon, raw }
    );
  }
  return updates;
}

export function createUsgsSource(fetchUrl = '/api/usgs'): EarthwireSource {
  const listeners = new Set<(update: SourceUpdate) => void>();
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastEventTime = 0;

  async function poll(): Promise<void> {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const data = await res.json();
      const updates = parseUsgsGeoJson(data);
      for (const update of updates) {
        if (update.timestamp > lastEventTime) {
          lastEventTime = update.timestamp;
          for (const cb of listeners) cb(update);
        }
      }
    } catch {
      // hold last value, retry on next poll
    }
  }

  return {
    id: 'usgs-earthquakes',
    name: 'Earthquakes',
    icon: 'volcano',
    description: 'Real-time earthquake data from USGS',
    attribution: {
      provider: 'U.S. Geological Survey (USGS)',
      license: 'Public domain (U.S. Government)',
      url: 'https://earthquake.usgs.gov/'
    },
    fields: USGS_FIELDS,
    async connect() {
      await poll();
      pollInterval = setInterval(poll, 60_000);
    },
    disconnect() {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      listeners.clear();
    },
    onUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}
