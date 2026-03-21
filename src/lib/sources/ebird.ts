import type { EarthwireSource, SourceField, SourceUpdate } from './types.js';

const EBIRD_FIELDS: SourceField[] = [
  { id: 'observation-count', name: 'Observation Count', unit: 'observations', expectedRange: [0, 100] },
  { id: 'total-individuals', name: 'Total Individuals', unit: 'birds', expectedRange: [0, 500] },
  { id: 'species-diversity', name: 'Species Diversity', unit: 'species', expectedRange: [0, 50] }
];

export function parseEbirdResponse(data: any[]): SourceUpdate[] {
  const now = Date.now();
  const speciesCount = data.length;
  const totalIndividuals = data.reduce((sum, obs) => sum + (obs.howMany || 1), 0);
  const uniqueSpecies = new Set(data.map((obs) => obs.speciesCode)).size;

  return [
    { timestamp: now, fieldId: 'observation-count', value: speciesCount, raw: data },
    { timestamp: now, fieldId: 'total-individuals', value: totalIndividuals, raw: data },
    { timestamp: now, fieldId: 'species-diversity', value: uniqueSpecies, raw: data }
  ];
}

export function createEbirdSource(fetchUrl = '/api/ebird'): EarthwireSource {
  const listeners = new Set<(update: SourceUpdate) => void>();
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const data = await res.json();
      const updates = parseEbirdResponse(data);
      for (const update of updates) {
        for (const cb of listeners) cb(update);
      }
    } catch {
      // hold last value
    }
  }

  return {
    id: 'ebird-activity',
    name: 'Bird Activity',
    icon: 'bird',
    description: 'Recent bird observations from Cornell eBird',
    attribution: {
      provider: 'Cornell Lab of Ornithology (eBird)',
      license: 'eBird Terms of Use',
      url: 'https://ebird.org/'
    },
    fields: EBIRD_FIELDS,
    async connect() {
      await poll();
      pollInterval = setInterval(poll, 15 * 60_000);
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
