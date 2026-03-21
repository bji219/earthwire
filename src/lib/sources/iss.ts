import * as satellite from 'satellite.js';
import type { EarthwireSource, SourceField, SourceUpdate } from './types.js';

const ISS_FIELDS: SourceField[] = [
  { id: 'latitude', name: 'Latitude', unit: 'degrees', expectedRange: [-90, 90] },
  { id: 'longitude', name: 'Longitude', unit: 'degrees', expectedRange: [-180, 180] },
  { id: 'altitude', name: 'Altitude', unit: 'km', expectedRange: [400, 420] },
  { id: 'velocity', name: 'Velocity', unit: 'km/s', expectedRange: [7.5, 7.8] }
];

export interface IssPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
}

export function computeIssPosition(tleLine1: string, tleLine2: string, date: Date): IssPosition {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  const posVel = satellite.propagate(satrec, date);

  if (typeof posVel.position === 'boolean' || typeof posVel.velocity === 'boolean') {
    throw new Error('SGP4 propagation failed');
  }

  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);

  const latitude = satellite.degreesLat(geo.latitude);
  const longitude = satellite.degreesLong(geo.longitude);
  const altitude = geo.height;

  const vel = posVel.velocity as satellite.EciVec3<number>;
  const velocity = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);

  return { latitude, longitude, altitude, velocity };
}

export function createIssSource(fetchUrl = '/api/iss'): EarthwireSource {
  const listeners = new Set<(update: SourceUpdate) => void>();
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let tleLine1 = '';
  let tleLine2 = '';

  async function fetchTle(): Promise<void> {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const data = await res.json();
      tleLine1 = data.line1;
      tleLine2 = data.line2;
    } catch {
      // retry on next poll
    }
  }

  function computeAndEmit(): void {
    if (!tleLine1 || !tleLine2) return;
    try {
      const pos = computeIssPosition(tleLine1, tleLine2, new Date());
      const now = Date.now();
      const updates: SourceUpdate[] = [
        { timestamp: now, fieldId: 'latitude', value: pos.latitude, raw: pos },
        { timestamp: now, fieldId: 'longitude', value: pos.longitude, raw: pos },
        { timestamp: now, fieldId: 'altitude', value: pos.altitude, raw: pos },
        { timestamp: now, fieldId: 'velocity', value: pos.velocity, raw: pos }
      ];
      for (const update of updates) {
        for (const cb of listeners) cb(update);
      }
    } catch {
      // hold last value on propagation error
    }
  }

  return {
    id: 'iss-position',
    name: 'ISS Position',
    icon: 'telescope',
    description: 'Real-time International Space Station position computed from TLE data',
    attribution: {
      provider: 'CelesTrak / NASA',
      license: 'Public domain',
      url: 'https://celestrak.org/'
    },
    fields: ISS_FIELDS,
    async connect() {
      await fetchTle();
      computeAndEmit();
      pollInterval = setInterval(computeAndEmit, 5_000);
      setInterval(fetchTle, 2 * 60 * 60 * 1000);
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
