import { describe, it, expect } from 'vitest';
import { createIssSource, computeIssPosition } from './iss.js';

const SAMPLE_TLE = {
  line1: '1 25544U 98067A   24080.54791667  .00016717  00000-0  10270-3 0  9006',
  line2: '2 25544  51.6400 208.0380 0004348 220.4882 274.2197 15.49515000300000'
};

describe('computeIssPosition', () => {
  it('returns lat, lon, altitude, velocity from TLE', () => {
    const pos = computeIssPosition(SAMPLE_TLE.line1, SAMPLE_TLE.line2, new Date('2024-03-20T12:00:00Z'));
    expect(pos).toHaveProperty('latitude');
    expect(pos).toHaveProperty('longitude');
    expect(pos).toHaveProperty('altitude');
    expect(pos).toHaveProperty('velocity');
    expect(pos.latitude).toBeGreaterThanOrEqual(-90);
    expect(pos.latitude).toBeLessThanOrEqual(90);
    expect(pos.longitude).toBeGreaterThanOrEqual(-180);
    expect(pos.longitude).toBeLessThanOrEqual(180);
    expect(pos.altitude).toBeGreaterThan(0);
    expect(pos.velocity).toBeGreaterThan(0);
  });
});

describe('createIssSource', () => {
  it('has correct metadata', () => {
    const source = createIssSource();
    expect(source.id).toBe('iss-position');
    expect(source.fields.length).toBe(4);
    expect(source.attribution.provider).toContain('CelesTrak');
  });
});
