import { describe, it, expect } from 'vitest';
import { createEbirdSource, parseEbirdResponse } from './ebird.js';

const MOCK_EBIRD_DATA = [
  { speciesCode: 'norcar', comName: 'Northern Cardinal', howMany: 3, obsDt: '2024-03-20 10:30', lat: 40.7, lng: -74.0, locName: 'Central Park' },
  { speciesCode: 'baleag', comName: 'Bald Eagle', howMany: 1, obsDt: '2024-03-20 09:15', lat: 40.8, lng: -73.9, locName: 'Riverside' },
  { speciesCode: 'amrob', comName: 'American Robin', howMany: 5, obsDt: '2024-03-20 11:00', lat: 40.7, lng: -74.0, locName: 'Central Park' }
];

describe('parseEbirdResponse', () => {
  it('extracts observation count', () => {
    const updates = parseEbirdResponse(MOCK_EBIRD_DATA);
    const counts = updates.filter((u) => u.fieldId === 'observation-count');
    expect(counts).toHaveLength(1);
    expect(counts[0].value).toBe(3);
  });

  it('extracts total individuals', () => {
    const updates = parseEbirdResponse(MOCK_EBIRD_DATA);
    const totals = updates.filter((u) => u.fieldId === 'total-individuals');
    expect(totals).toHaveLength(1);
    expect(totals[0].value).toBe(9);
  });

  it('extracts species diversity', () => {
    const updates = parseEbirdResponse(MOCK_EBIRD_DATA);
    const diversity = updates.filter((u) => u.fieldId === 'species-diversity');
    expect(diversity).toHaveLength(1);
    expect(diversity[0].value).toBe(3);
  });
});

describe('createEbirdSource', () => {
  it('has correct metadata', () => {
    const source = createEbirdSource();
    expect(source.id).toBe('ebird-activity');
    expect(source.attribution.provider).toContain('Cornell');
  });
});
