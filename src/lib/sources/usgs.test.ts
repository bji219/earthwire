import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUsgsSource, parseUsgsGeoJson } from './usgs.js';

const MOCK_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { mag: 4.5, place: '10km SSW of Somewhere', time: 1711000000000, type: 'earthquake' },
      geometry: { type: 'Point', coordinates: [-122.5, 37.5, 8.2] }
    },
    {
      type: 'Feature',
      properties: { mag: 2.1, place: '5km NW of Elsewhere', time: 1711000060000, type: 'earthquake' },
      geometry: { type: 'Point', coordinates: [-118.2, 34.1, 12.5] }
    }
  ]
};

describe('parseUsgsGeoJson', () => {
  it('extracts magnitude values', () => {
    const updates = parseUsgsGeoJson(MOCK_GEOJSON);
    const mags = updates.filter((u) => u.fieldId === 'magnitude');
    expect(mags).toHaveLength(2);
    expect(mags[0].value).toBe(4.5);
    expect(mags[1].value).toBe(2.1);
  });

  it('extracts depth values', () => {
    const updates = parseUsgsGeoJson(MOCK_GEOJSON);
    const depths = updates.filter((u) => u.fieldId === 'depth');
    expect(depths).toHaveLength(2);
    expect(depths[0].value).toBe(8.2);
  });

  it('extracts latitude and longitude', () => {
    const updates = parseUsgsGeoJson(MOCK_GEOJSON);
    const lats = updates.filter((u) => u.fieldId === 'latitude');
    expect(lats[0].value).toBe(37.5);
    const lons = updates.filter((u) => u.fieldId === 'longitude');
    expect(lons[0].value).toBe(-122.5);
  });

  it('includes timestamp from earthquake properties', () => {
    const updates = parseUsgsGeoJson(MOCK_GEOJSON);
    expect(updates[0].timestamp).toBe(1711000000000);
  });
});

describe('createUsgsSource', () => {
  it('has correct metadata', () => {
    const source = createUsgsSource();
    expect(source.id).toBe('usgs-earthquakes');
    expect(source.fields.length).toBeGreaterThanOrEqual(4);
    expect(source.attribution.provider).toContain('USGS');
  });

  it('has expected fields', () => {
    const source = createUsgsSource();
    const fieldIds = source.fields.map((f) => f.id);
    expect(fieldIds).toContain('magnitude');
    expect(fieldIds).toContain('depth');
    expect(fieldIds).toContain('latitude');
    expect(fieldIds).toContain('longitude');
  });
});
