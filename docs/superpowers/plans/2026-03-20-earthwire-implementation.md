# Earthwire Implementation Plan (Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Earthwire — a web app that streams live scientific data (earthquakes, ISS position, bird activity) into MIDI/OSC control signals, with a built-in demo synth for instant gratification.

**Architecture:** SvelteKit single-page app. Data sources produce timestamped values via a common adapter interface. A source registry manages singleton instances. Each channel runs data through a processing chain (normalizer → smoother → quantizer → threshold) and routes output to Web MIDI, OSC, or a demo synth. All processing is client-side; SvelteKit server routes proxy external APIs.

**Tech Stack:** SvelteKit, TypeScript, pnpm, Vitest, Web MIDI API, Web Audio API, HTML5 Canvas, satellite.js, Vercel

**Spec:** `docs/superpowers/specs/2026-03-20-earthwire-design.md`

---

## File Map

### Core Types
- `src/lib/sources/types.ts` — `EarthwireSource`, `SourceField`, `SourceUpdate`, `SourceAttribution` interfaces
- `src/lib/engine/types.ts` — `Channel`, `SignalValue`, `TriggerEvent`, `OutputEvent`, `PatchConfig` types
- `src/lib/nodes/types.ts` — `NormalizerConfig`, `SmootherConfig`, `QuantizerConfig`, `ThresholdConfig` types

### Processing Nodes
- `src/lib/nodes/normalizer.ts` — Scale raw values to 0.0–1.0 (auto/manual mode)
- `src/lib/nodes/smoother.ts` — Exponential moving average
- `src/lib/nodes/quantizer.ts` — Snap to MIDI notes, constrain to musical scales
- `src/lib/nodes/threshold.ts` — Emit triggers on level crossing

### Source Adapters
- `src/lib/sources/registry.ts` — Singleton source manager with ref-counting
- `src/lib/sources/usgs.ts` — USGS earthquake adapter
- `src/lib/sources/iss.ts` — ISS position via CelesTrak TLE + satellite.js SGP4
- `src/lib/sources/ebird.ts` — Cornell eBird bird activity adapter

### Engine
- `src/lib/engine/engine.ts` — Channel evaluator, processes data ticks through chains
- `src/lib/engine/clock.ts` — BPM clock using AudioContext

### Outputs
- `src/lib/outputs/midi.ts` — Web MIDI API output (CC, Note, Trigger)
- `src/lib/outputs/demo-synth.ts` — Web Audio demo synth

### Stores
- `src/lib/stores/patch.ts` — Patch state, save/load, localStorage
- `src/lib/stores/midi.ts` — MIDI access, port enumeration
- `src/lib/stores/clock.ts` — BPM state

### API Proxies
- `src/routes/api/usgs/+server.ts` — Proxy USGS GeoJSON, cache 60s
- `src/routes/api/iss/+server.ts` — Proxy CelesTrak TLE data
- `src/routes/api/ebird/+server.ts` — Proxy eBird API with server-side key

### UI
- `src/routes/+page.svelte` — Main page (landing + app)
- `src/lib/components/ChannelStrip.svelte` — Single channel strip
- `src/lib/components/SignalMeter.svelte` — Canvas signal scope
- `src/lib/components/DemoSynthControls.svelte` — Demo synth UI
- `src/lib/components/TopBar.svelte` — BPM, MIDI device, save controls
- `src/lib/components/LandingHero.svelte` — First-time "Try it" experience

### Tests
- `src/lib/nodes/normalizer.test.ts`
- `src/lib/nodes/smoother.test.ts`
- `src/lib/nodes/quantizer.test.ts`
- `src/lib/nodes/threshold.test.ts`
- `src/lib/sources/registry.test.ts`
- `src/lib/sources/usgs.test.ts`
- `src/lib/engine/engine.test.ts`
- `src/lib/engine/clock.test.ts`
- `src/lib/outputs/midi.test.ts`
- `src/lib/stores/patch.test.ts`

---

## Phase 0 — Foundation

---

### Task 1: Scaffold SvelteKit Project

**Files:**
- Create: `package.json`, `svelte.config.js`, `tsconfig.json`, `vite.config.ts`, `src/app.html`, `src/routes/+page.svelte`

- [ ] **Step 1: Initialize SvelteKit project**

```bash
cd /Users/BrendanInglis/sci-beat
pnpm create svelte@latest . --template skeleton --types typescript --no-add-ons
```

When prompted: select "Skeleton project", "Yes, using TypeScript syntax", no additional options.

If the directory is not empty, allow overwriting (the existing spec files are in `docs/` and won't conflict).

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 3: Install dev dependencies for testing**

```bash
pnpm add -D vitest @testing-library/svelte jsdom
```

- [ ] **Step 4: Install Vercel adapter**

```bash
pnpm add -D @sveltejs/adapter-vercel
```

- [ ] **Step 5: Configure Vercel adapter in svelte.config.js**

Replace the adapter import in `svelte.config.js`:

```javascript
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	},
	preprocess: vitePreprocess()
};

export default config;
```

- [ ] **Step 6: Configure Vitest in vite.config.ts**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom'
	}
});
```

- [ ] **Step 7: Add test script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Verify dev server starts**

```bash
pnpm dev --port 5173 &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML output from SvelteKit.

- [ ] **Step 9: Verify tests run**

```bash
pnpm test
```

Expected: "No test files found" or passes with 0 tests. No errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit project with TypeScript, Vitest, Vercel adapter"
```

---

### Task 2: Core Type Definitions

**Files:**
- Create: `src/lib/sources/types.ts`
- Create: `src/lib/engine/types.ts`
- Create: `src/lib/nodes/types.ts`

- [ ] **Step 1: Create source adapter types**

Create `src/lib/sources/types.ts`:

```typescript
export interface EarthwireSource {
	id: string;
	name: string;
	icon: string;
	description: string;
	attribution: SourceAttribution;
	fields: SourceField[];
	connect(): Promise<void>;
	disconnect(): void;
	onUpdate(cb: (update: SourceUpdate) => void): () => void;
}

export interface SourceField {
	id: string;
	name: string;
	unit: string;
	expectedRange: [number, number];
}

export interface SourceUpdate {
	timestamp: number;
	fieldId: string;
	value: number;
	raw: unknown;
}

export interface SourceAttribution {
	provider: string;
	license: string;
	url: string;
}
```

- [ ] **Step 2: Create node config types**

Create `src/lib/nodes/types.ts`:

```typescript
export interface NormalizerConfig {
	mode: 'auto' | 'manual';
	/** For auto mode: rolling window size in seconds */
	windowSeconds?: number;
	/** For manual mode: explicit min/max */
	min?: number;
	max?: number;
}

export interface SmootherConfig {
	/** 0.0 = raw (no smoothing), 1.0 = very smooth */
	amount: number;
}

export type ScaleName =
	| 'chromatic'
	| 'major'
	| 'minor'
	| 'pentatonic'
	| 'blues'
	| 'dorian'
	| 'mixolydian';

export interface QuantizerConfig {
	/** Root note as MIDI number (e.g., 60 = C4) */
	root: number;
	/** Musical scale to constrain to */
	scale: ScaleName;
}

export type ThresholdDirection = 'rising' | 'falling' | 'both';
export type BeatSubdivision = '1/4' | '1/8' | '1/16' | null;

export interface ThresholdConfig {
	/** Signal level (0.0–1.0) at which to trigger */
	level: number;
	/** Which direction of crossing triggers */
	direction: ThresholdDirection;
	/** Optional: quantize triggers to beat subdivisions */
	beatQuantize: BeatSubdivision;
}
```

- [ ] **Step 3: Create engine types**

Create `src/lib/engine/types.ts`:

```typescript
import type { NormalizerConfig, SmootherConfig, QuantizerConfig, ThresholdConfig } from '../nodes/types.js';

export interface ChannelConfig {
	sourceId: string;
	fieldId: string;
	normalizer: NormalizerConfig;
	smoother: SmootherConfig | null;
	quantizer: QuantizerConfig | null;
	threshold: ThresholdConfig | null;
	output: OutputConfig;
}

export type OutputConfig =
	| { type: 'midi-cc'; channel: number; cc: number; port?: string }
	| { type: 'midi-note'; channel: number; port?: string }
	| { type: 'midi-trigger'; channel: number; note: number; port?: string }
	| { type: 'osc'; address?: string }
	| { type: 'demo-synth'; param: DemoSynthParam };

export type DemoSynthParam = 'filter-cutoff' | 'filter-resonance' | 'osc-pitch' | 'osc-detune' | 'drum-trigger' | 'reverb-mix';

export interface PatchConfig {
	id: string;
	name: string;
	specVersion: string;
	bpm: number;
	channels: ChannelConfig[];
}

export interface SignalValue {
	value: number;
	timestamp: number;
}

export interface TriggerEvent {
	timestamp: number;
	velocity: number;
}

export interface ChannelOutput {
	continuous: number;
	trigger: TriggerEvent | null;
	/** For note mode: quantized MIDI note number */
	note: number | null;
}
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/types.ts src/lib/engine/types.ts src/lib/nodes/types.ts
git commit -m "feat: add core type definitions for sources, nodes, and engine"
```

---

### Task 3: Normalizer Node (TDD)

**Files:**
- Create: `src/lib/nodes/normalizer.ts`
- Create: `src/lib/nodes/normalizer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nodes/normalizer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createNormalizer } from './normalizer.js';

describe('normalizer', () => {
	describe('manual mode', () => {
		it('maps value within range to 0-1', () => {
			const norm = createNormalizer({ mode: 'manual', min: 0, max: 10 });
			expect(norm.process(5)).toBeCloseTo(0.5);
			expect(norm.process(0)).toBeCloseTo(0.0);
			expect(norm.process(10)).toBeCloseTo(1.0);
		});

		it('clamps values outside range', () => {
			const norm = createNormalizer({ mode: 'manual', min: 0, max: 10 });
			expect(norm.process(-5)).toBeCloseTo(0.0);
			expect(norm.process(15)).toBeCloseTo(1.0);
		});

		it('handles inverted range', () => {
			const norm = createNormalizer({ mode: 'manual', min: 10, max: 0 });
			expect(norm.process(10)).toBeCloseTo(0.0);
			expect(norm.process(0)).toBeCloseTo(1.0);
		});

		it('handles zero-width range without NaN', () => {
			const norm = createNormalizer({ mode: 'manual', min: 5, max: 5 });
			expect(norm.process(5)).toBeCloseTo(0.5);
		});
	});

	describe('auto mode', () => {
		it('normalizes based on observed min/max', () => {
			const norm = createNormalizer({ mode: 'auto' });
			norm.process(10);
			norm.process(20);
			expect(norm.process(15)).toBeCloseTo(0.5);
		});

		it('returns 0.5 for first value (no range yet)', () => {
			const norm = createNormalizer({ mode: 'auto' });
			expect(norm.process(42)).toBeCloseTo(0.5);
		});

		it('expands range as new extremes arrive', () => {
			const norm = createNormalizer({ mode: 'auto' });
			norm.process(0);
			norm.process(10);
			expect(norm.process(5)).toBeCloseTo(0.5);
			norm.process(20);
			expect(norm.process(10)).toBeCloseTo(0.5);
		});
	});

	describe('reset', () => {
		it('clears auto mode history', () => {
			const norm = createNormalizer({ mode: 'auto' });
			norm.process(0);
			norm.process(100);
			norm.reset();
			expect(norm.process(50)).toBeCloseTo(0.5);
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/nodes/normalizer.test.ts
```

Expected: FAIL — module `./normalizer.js` not found.

- [ ] **Step 3: Implement normalizer**

Create `src/lib/nodes/normalizer.ts`:

```typescript
import type { NormalizerConfig } from './types.js';

export interface Normalizer {
	process(rawValue: number): number;
	reset(): void;
}

export function createNormalizer(config: NormalizerConfig): Normalizer {
	let observedMin = Infinity;
	let observedMax = -Infinity;
	let sampleCount = 0;

	function process(rawValue: number): number {
		if (config.mode === 'manual') {
			return manualNormalize(rawValue, config.min ?? 0, config.max ?? 1);
		}
		return autoNormalize(rawValue);
	}

	function manualNormalize(value: number, min: number, max: number): number {
		if (min === max) return 0.5;
		const normalized = (value - min) / (max - min);
		return Math.max(0, Math.min(1, normalized));
	}

	function autoNormalize(value: number): number {
		sampleCount++;
		if (sampleCount === 1) {
			observedMin = value;
			observedMax = value;
			return 0.5;
		}
		observedMin = Math.min(observedMin, value);
		observedMax = Math.max(observedMax, value);
		if (observedMin === observedMax) return 0.5;
		return (value - observedMin) / (observedMax - observedMin);
	}

	function reset(): void {
		observedMin = Infinity;
		observedMax = -Infinity;
		sampleCount = 0;
	}

	return { process, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/nodes/normalizer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/normalizer.ts src/lib/nodes/normalizer.test.ts
git commit -m "feat: add normalizer node with auto/manual modes (TDD)"
```

---

### Task 4: Smoother Node (TDD)

**Files:**
- Create: `src/lib/nodes/smoother.ts`
- Create: `src/lib/nodes/smoother.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nodes/smoother.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createSmoother } from './smoother.js';

describe('smoother', () => {
	it('returns raw value when amount is 0', () => {
		const smooth = createSmoother({ amount: 0 });
		expect(smooth.process(1.0)).toBeCloseTo(1.0);
		expect(smooth.process(0.0)).toBeCloseTo(0.0);
	});

	it('smooths values with high amount', () => {
		const smooth = createSmoother({ amount: 0.9 });
		smooth.process(0.0);
		const result = smooth.process(1.0);
		// With high smoothing, jump from 0→1 should be dampened
		expect(result).toBeGreaterThan(0.0);
		expect(result).toBeLessThan(0.5);
	});

	it('converges toward target over multiple samples', () => {
		const smooth = createSmoother({ amount: 0.5 });
		smooth.process(0.0);
		const r1 = smooth.process(1.0);
		const r2 = smooth.process(1.0);
		const r3 = smooth.process(1.0);
		// Each step should get closer to 1.0
		expect(r1).toBeLessThan(r2);
		expect(r2).toBeLessThan(r3);
		expect(r3).toBeLessThan(1.0);
	});

	it('first sample returns the value directly', () => {
		const smooth = createSmoother({ amount: 0.9 });
		expect(smooth.process(0.7)).toBeCloseTo(0.7);
	});

	it('reset clears state', () => {
		const smooth = createSmoother({ amount: 0.9 });
		smooth.process(1.0);
		smooth.process(1.0);
		smooth.reset();
		expect(smooth.process(0.0)).toBeCloseTo(0.0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/nodes/smoother.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement smoother**

Create `src/lib/nodes/smoother.ts`:

```typescript
import type { SmootherConfig } from './types.js';

export interface Smoother {
	process(value: number): number;
	reset(): void;
}

export function createSmoother(config: SmootherConfig): Smoother {
	let previous: number | null = null;

	function process(value: number): number {
		if (previous === null) {
			previous = value;
			return value;
		}
		// EMA: output = alpha * input + (1 - alpha) * previous
		// amount=0 means alpha=1 (no smoothing), amount=1 means alpha≈0 (max smoothing)
		const alpha = 1 - config.amount;
		previous = alpha * value + (1 - alpha) * previous;
		return previous;
	}

	function reset(): void {
		previous = null;
	}

	return { process, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/nodes/smoother.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/smoother.ts src/lib/nodes/smoother.test.ts
git commit -m "feat: add smoother node with exponential moving average (TDD)"
```

---

### Task 5: Source Registry (TDD)

**Files:**
- Create: `src/lib/sources/registry.ts`
- Create: `src/lib/sources/registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/sources/registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceRegistry } from './registry.js';
import type { EarthwireSource, SourceUpdate } from './types.js';

function createMockSource(id: string): EarthwireSource {
	const listeners = new Set<(update: SourceUpdate) => void>();
	return {
		id,
		name: `Mock ${id}`,
		icon: 'test',
		description: 'Test source',
		attribution: { provider: 'Test', license: 'MIT', url: 'https://example.com' },
		fields: [{ id: 'value', name: 'Value', unit: 'units', expectedRange: [0, 100] as [number, number] }],
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
		onUpdate: vi.fn((cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		})
	};
}

describe('SourceRegistry', () => {
	let registry: SourceRegistry;

	beforeEach(() => {
		registry = new SourceRegistry();
	});

	it('registers and retrieves a source factory', () => {
		const source = createMockSource('test');
		registry.registerFactory('test', () => source);
		expect(registry.getAvailableSources()).toContain('test');
	});

	it('acquires a source and calls connect', async () => {
		const source = createMockSource('test');
		registry.registerFactory('test', () => source);
		const acquired = await registry.acquire('test');
		expect(acquired).toBe(source);
		expect(source.connect).toHaveBeenCalledOnce();
	});

	it('returns same instance on second acquire (singleton)', async () => {
		const source = createMockSource('test');
		registry.registerFactory('test', () => source);
		const first = await registry.acquire('test');
		const second = await registry.acquire('test');
		expect(first).toBe(second);
		expect(source.connect).toHaveBeenCalledOnce();
	});

	it('disconnects when last consumer releases', async () => {
		const source = createMockSource('test');
		registry.registerFactory('test', () => source);
		await registry.acquire('test');
		await registry.acquire('test');
		registry.release('test');
		expect(source.disconnect).not.toHaveBeenCalled();
		registry.release('test');
		expect(source.disconnect).toHaveBeenCalledOnce();
	});

	it('throws on acquire of unregistered source', async () => {
		await expect(registry.acquire('nonexistent')).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/sources/registry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement registry**

Create `src/lib/sources/registry.ts`:

```typescript
import type { EarthwireSource } from './types.js';

type SourceFactory = () => EarthwireSource;

interface SourceEntry {
	source: EarthwireSource;
	refCount: number;
}

export class SourceRegistry {
	private factories = new Map<string, SourceFactory>();
	private instances = new Map<string, SourceEntry>();

	registerFactory(id: string, factory: SourceFactory): void {
		this.factories.set(id, factory);
	}

	getAvailableSources(): string[] {
		return Array.from(this.factories.keys());
	}

	async acquire(id: string): Promise<EarthwireSource> {
		const existing = this.instances.get(id);
		if (existing) {
			existing.refCount++;
			return existing.source;
		}

		const factory = this.factories.get(id);
		if (!factory) {
			throw new Error(`No source registered with id: ${id}`);
		}

		const source = factory();
		await source.connect();
		this.instances.set(id, { source, refCount: 1 });
		return source;
	}

	release(id: string): void {
		const entry = this.instances.get(id);
		if (!entry) return;

		entry.refCount--;
		if (entry.refCount <= 0) {
			entry.source.disconnect();
			this.instances.delete(id);
		}
	}

	getSource(id: string): EarthwireSource | undefined {
		return this.instances.get(id)?.source;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/sources/registry.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/registry.ts src/lib/sources/registry.test.ts
git commit -m "feat: add source registry with singleton instances and ref-counting (TDD)"
```

---

### Task 6: USGS Earthquake Source Adapter + API Proxy

**Files:**
- Create: `src/lib/sources/usgs.ts`
- Create: `src/lib/sources/usgs.test.ts`
- Create: `src/routes/api/usgs/+server.ts`

- [ ] **Step 1: Write failing tests for USGS adapter**

Create `src/lib/sources/usgs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUsgsSource, parseUsgsGeoJson } from './usgs.js';

const MOCK_GEOJSON = {
	type: 'FeatureCollection',
	features: [
		{
			type: 'Feature',
			properties: {
				mag: 4.5,
				place: '10km SSW of Somewhere',
				time: 1711000000000,
				type: 'earthquake'
			},
			geometry: {
				type: 'Point',
				coordinates: [-122.5, 37.5, 8.2]
			}
		},
		{
			type: 'Feature',
			properties: {
				mag: 2.1,
				place: '5km NW of Elsewhere',
				time: 1711000060000,
				type: 'earthquake'
			},
			geometry: {
				type: 'Point',
				coordinates: [-118.2, 34.1, 12.5]
			}
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/sources/usgs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement USGS source adapter**

Create `src/lib/sources/usgs.ts`:

```typescript
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
			// Error handling: hold last value, retry on next poll
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
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
			listeners.clear();
		},
		onUpdate(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/sources/usgs.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Create USGS API proxy**

Create `src/routes/api/usgs/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
const CACHE_TTL = 60_000;

let cachedData: unknown = null;
let cachedAt = 0;

export const GET: RequestHandler = async () => {
	const now = Date.now();
	if (cachedData && now - cachedAt < CACHE_TTL) {
		return json(cachedData, {
			headers: {
				'X-Earthwire-Source': 'USGS',
				'X-Earthwire-License': 'Public Domain',
				'X-Earthwire-Attribution': 'U.S. Geological Survey'
			}
		});
	}

	const res = await fetch(USGS_URL);
	if (!res.ok) {
		return json({ error: 'USGS API unavailable' }, { status: 502 });
	}

	cachedData = await res.json();
	cachedAt = now;

	return json(cachedData, {
		headers: {
			'X-Earthwire-Source': 'USGS',
			'X-Earthwire-License': 'Public Domain',
			'X-Earthwire-Attribution': 'U.S. Geological Survey'
		}
	});
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/usgs.ts src/lib/sources/usgs.test.ts src/routes/api/usgs/+server.ts
git commit -m "feat: add USGS earthquake source adapter and API proxy (TDD)"
```

---

### Task 7: Engine — Channel Evaluator (TDD)

**Files:**
- Create: `src/lib/engine/engine.ts`
- Create: `src/lib/engine/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/engine/engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EarthwireEngine } from './engine.js';
import type { ChannelConfig } from './types.js';

describe('EarthwireEngine', () => {
	it('processes a raw value through normalizer only', () => {
		const engine = new EarthwireEngine();
		const channel: ChannelConfig = {
			sourceId: 'test',
			fieldId: 'value',
			normalizer: { mode: 'manual', min: 0, max: 100 },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		};
		engine.addChannel(channel);

		const output = engine.processValue(0, 50);
		expect(output.continuous).toBeCloseTo(0.5);
		expect(output.trigger).toBeNull();
	});

	it('chains normalizer and smoother', () => {
		const engine = new EarthwireEngine();
		const channel: ChannelConfig = {
			sourceId: 'test',
			fieldId: 'value',
			normalizer: { mode: 'manual', min: 0, max: 100 },
			smoother: { amount: 0.5 },
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		};
		engine.addChannel(channel);

		engine.processValue(0, 0);
		const output = engine.processValue(0, 100);
		// Smoother should dampen the jump from 0→1
		expect(output.continuous).toBeGreaterThan(0);
		expect(output.continuous).toBeLessThan(1);
	});

	it('manages multiple channels independently', () => {
		const engine = new EarthwireEngine();
		engine.addChannel({
			sourceId: 'a',
			fieldId: 'v',
			normalizer: { mode: 'manual', min: 0, max: 10 },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		});
		engine.addChannel({
			sourceId: 'b',
			fieldId: 'v',
			normalizer: { mode: 'manual', min: 0, max: 100 },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 2, cc: 2 }
		});

		const out0 = engine.processValue(0, 5);
		const out1 = engine.processValue(1, 50);
		expect(out0.continuous).toBeCloseTo(0.5);
		expect(out1.continuous).toBeCloseTo(0.5);
	});

	it('removes a channel', () => {
		const engine = new EarthwireEngine();
		engine.addChannel({
			sourceId: 'a',
			fieldId: 'v',
			normalizer: { mode: 'manual', min: 0, max: 10 },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		});
		expect(engine.channelCount).toBe(1);
		engine.removeChannel(0);
		expect(engine.channelCount).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/engine/engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement engine**

Create `src/lib/engine/engine.ts`:

```typescript
import { createNormalizer, type Normalizer } from '../nodes/normalizer.js';
import { createSmoother, type Smoother } from '../nodes/smoother.js';
import type { ChannelConfig, ChannelOutput } from './types.js';

interface ChannelState {
	config: ChannelConfig;
	normalizer: Normalizer;
	smoother: Smoother | null;
}

export class EarthwireEngine {
	private channels: ChannelState[] = [];

	get channelCount(): number {
		return this.channels.length;
	}

	addChannel(config: ChannelConfig): void {
		const normalizer = createNormalizer(config.normalizer);
		const smoother = config.smoother ? createSmoother(config.smoother) : null;

		this.channels.push({ config, normalizer, smoother });
	}

	removeChannel(index: number): void {
		this.channels.splice(index, 1);
	}

	processValue(channelIndex: number, rawValue: number): ChannelOutput {
		const channel = this.channels[channelIndex];
		if (!channel) {
			return { continuous: 0, trigger: null, note: null };
		}

		let value = channel.normalizer.process(rawValue);

		if (channel.smoother) {
			value = channel.smoother.process(value);
		}

		return {
			continuous: value,
			trigger: null,
			note: null
		};
	}

	getChannelConfig(index: number): ChannelConfig | undefined {
		return this.channels[index]?.config;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/engine/engine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/engine.ts src/lib/engine/engine.test.ts
git commit -m "feat: add engine with channel processing chain (TDD)"
```

---

### Task 8: BPM Clock

**Files:**
- Create: `src/lib/engine/clock.ts`
- Create: `src/lib/engine/clock.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/engine/clock.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BpmClock } from './clock.js';

describe('BpmClock', () => {
	it('initializes with default BPM', () => {
		const clock = new BpmClock();
		expect(clock.bpm).toBe(120);
	});

	it('allows setting BPM', () => {
		const clock = new BpmClock(140);
		expect(clock.bpm).toBe(140);
		clock.bpm = 90;
		expect(clock.bpm).toBe(90);
	});

	it('calculates beat duration in ms', () => {
		const clock = new BpmClock(120);
		expect(clock.beatDurationMs).toBeCloseTo(500);
	});

	it('calculates subdivision duration', () => {
		const clock = new BpmClock(120);
		// At 120 BPM: quarter = 500ms, eighth = 250ms, sixteenth = 125ms
		expect(clock.subdivisionMs('1/4')).toBeCloseTo(500);
		expect(clock.subdivisionMs('1/8')).toBeCloseTo(250);
		expect(clock.subdivisionMs('1/16')).toBeCloseTo(125);
	});

	it('quantizes a timestamp to the nearest subdivision', () => {
		const clock = new BpmClock(120);
		clock.startTime = 0;
		// At 120 BPM, quarter notes at 0, 500, 1000, 1500...
		expect(clock.quantize(240, '1/4')).toBe(500);
		expect(clock.quantize(260, '1/4')).toBe(500);
		expect(clock.quantize(100, '1/4')).toBe(0);
	});

	it('returns null subdivision duration for null', () => {
		const clock = new BpmClock(120);
		expect(clock.subdivisionMs(null)).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/engine/clock.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement clock**

Create `src/lib/engine/clock.ts`:

```typescript
import type { BeatSubdivision } from '../nodes/types.js';

export class BpmClock {
	private _bpm: number;
	startTime: number = 0;

	constructor(bpm: number = 120) {
		this._bpm = bpm;
	}

	get bpm(): number {
		return this._bpm;
	}

	set bpm(value: number) {
		this._bpm = Math.max(1, Math.min(300, value));
	}

	get beatDurationMs(): number {
		return 60_000 / this._bpm;
	}

	subdivisionMs(subdivision: BeatSubdivision): number | null {
		if (subdivision === null) return null;
		const beat = this.beatDurationMs;
		switch (subdivision) {
			case '1/4':
				return beat;
			case '1/8':
				return beat / 2;
			case '1/16':
				return beat / 4;
		}
	}

	quantize(timestamp: number, subdivision: BeatSubdivision): number {
		const subMs = this.subdivisionMs(subdivision);
		if (subMs === null) return timestamp;

		const elapsed = timestamp - this.startTime;
		const beats = Math.round(elapsed / subMs);
		return this.startTime + beats * subMs;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/engine/clock.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/clock.ts src/lib/engine/clock.test.ts
git commit -m "feat: add BPM clock with subdivision quantization (TDD)"
```

---

### Task 9: Web MIDI Output

**Files:**
- Create: `src/lib/outputs/midi.ts`
- Create: `src/lib/outputs/midi.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/outputs/midi.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { midiCcMessage, midiNoteOnMessage, midiNoteOffMessage, continuousToMidi } from './midi.js';

describe('MIDI message helpers', () => {
	it('creates CC message bytes', () => {
		// CC on channel 1, controller 74, value 64
		const msg = midiCcMessage(1, 74, 64);
		expect(msg).toEqual([0xb0, 74, 64]); // 0xB0 = CC channel 1
	});

	it('creates CC on channel 10', () => {
		const msg = midiCcMessage(10, 1, 127);
		expect(msg).toEqual([0xb9, 1, 127]); // 0xB9 = CC channel 10
	});

	it('creates note on message', () => {
		const msg = midiNoteOnMessage(1, 60, 100);
		expect(msg).toEqual([0x90, 60, 100]);
	});

	it('creates note off message', () => {
		const msg = midiNoteOffMessage(1, 60);
		expect(msg).toEqual([0x80, 60, 0]);
	});

	it('converts 0-1 continuous to 0-127 MIDI', () => {
		expect(continuousToMidi(0.0)).toBe(0);
		expect(continuousToMidi(1.0)).toBe(127);
		expect(continuousToMidi(0.5)).toBe(64);
	});

	it('clamps out-of-range values', () => {
		expect(continuousToMidi(-0.1)).toBe(0);
		expect(continuousToMidi(1.5)).toBe(127);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/outputs/midi.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement MIDI output helpers**

Create `src/lib/outputs/midi.ts`:

```typescript
export function continuousToMidi(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 127);
}

export function midiCcMessage(channel: number, cc: number, value: number): number[] {
	return [0xb0 + (channel - 1), cc, value];
}

export function midiNoteOnMessage(channel: number, note: number, velocity: number): number[] {
	return [0x90 + (channel - 1), note, velocity];
}

export function midiNoteOffMessage(channel: number, note: number): number[] {
	return [0x80 + (channel - 1), note, 0];
}

export class MidiOutput {
	private access: MIDIAccess | null = null;

	async init(): Promise<boolean> {
		if (!navigator.requestMIDIAccess) return false;
		try {
			this.access = await navigator.requestMIDIAccess();
			return true;
		} catch {
			return false;
		}
	}

	getOutputPorts(): MIDIOutput[] {
		if (!this.access) return [];
		return Array.from(this.access.outputs.values());
	}

	sendCc(portId: string, channel: number, cc: number, value: number): void {
		const port = this.getPort(portId);
		if (!port) return;
		port.send(midiCcMessage(channel, cc, continuousToMidi(value)));
	}

	sendNoteOn(portId: string, channel: number, note: number, velocity: number): void {
		const port = this.getPort(portId);
		if (!port) return;
		port.send(midiNoteOnMessage(channel, note, velocity));
	}

	sendNoteOff(portId: string, channel: number, note: number): void {
		const port = this.getPort(portId);
		if (!port) return;
		port.send(midiNoteOffMessage(channel, note));
	}

	private getPort(portId: string): MIDIOutput | undefined {
		if (!this.access) return undefined;
		return this.access.outputs.get(portId);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/outputs/midi.test.ts
```

Expected: all tests PASS (only the pure function tests run; `MidiOutput` class requires browser).

- [ ] **Step 5: Commit**

```bash
git add src/lib/outputs/midi.ts src/lib/outputs/midi.test.ts
git commit -m "feat: add Web MIDI output with CC, note on/off helpers (TDD)"
```

---

### Task 10: Svelte Stores

**Files:**
- Create: `src/lib/stores/patch.ts`
- Create: `src/lib/stores/midi.ts`
- Create: `src/lib/stores/clock.ts`

- [ ] **Step 1: Create clock store**

Create `src/lib/stores/clock.ts`:

```typescript
import { writable } from 'svelte/store';

export const bpm = writable(120);
export const isPlaying = writable(false);
```

- [ ] **Step 2: Create MIDI store**

Create `src/lib/stores/midi.ts`:

```typescript
import { writable, derived } from 'svelte/store';

export const midiAccess = writable<MIDIAccess | null>(null);
export const selectedPortId = writable<string | null>(null);

export const outputPorts = derived(midiAccess, ($access) => {
	if (!$access) return [];
	return Array.from($access.outputs.values());
});

export async function initMidi(): Promise<boolean> {
	if (!navigator.requestMIDIAccess) return false;
	try {
		const access = await navigator.requestMIDIAccess();
		midiAccess.set(access);
		return true;
	} catch {
		return false;
	}
}
```

- [ ] **Step 3: Create patch store**

Create `src/lib/stores/patch.ts`:

```typescript
import { writable, get } from 'svelte/store';
import type { PatchConfig, ChannelConfig } from '$lib/engine/types.js';

const DEFAULT_PATCH: PatchConfig = {
	id: 'untitled',
	name: 'Untitled Patch',
	specVersion: '0.1.0',
	bpm: 120,
	channels: []
};

const STORAGE_KEY = 'earthwire-patch';

function loadFromStorage(): PatchConfig {
	if (typeof localStorage === 'undefined') return DEFAULT_PATCH;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) return JSON.parse(saved);
	} catch {
		// corrupted data, use default
	}
	return DEFAULT_PATCH;
}

function createPatchStore() {
	const { subscribe, set, update } = writable<PatchConfig>(loadFromStorage());

	// Auto-save on changes
	subscribe((patch) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
		}
	});

	return {
		subscribe,
		set,
		addChannel(channel: ChannelConfig) {
			update((p) => ({ ...p, channels: [...p.channels, channel] }));
		},
		removeChannel(index: number) {
			update((p) => ({
				...p,
				channels: p.channels.filter((_, i) => i !== index)
			}));
		},
		updateChannel(index: number, channel: ChannelConfig) {
			update((p) => ({
				...p,
				channels: p.channels.map((c, i) => (i === index ? channel : c))
			}));
		},
		setBpm(bpm: number) {
			update((p) => ({ ...p, bpm }));
		},
		exportJson(): string {
			return JSON.stringify(get({ subscribe }), null, 2);
		},
		importJson(json: string) {
			try {
				const parsed = JSON.parse(json) as PatchConfig;
				if (parsed.specVersion && parsed.channels) {
					set(parsed);
					return true;
				}
			} catch {
				// invalid JSON
			}
			return false;
		},
		reset() {
			set(DEFAULT_PATCH);
		}
	};
}

export const patch = createPatchStore();
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/clock.ts src/lib/stores/midi.ts src/lib/stores/patch.ts
git commit -m "feat: add Svelte stores for patch state, MIDI access, and clock"
```

---

### Task 11: Basic Channel-Strip UI

**Files:**
- Create: `src/lib/components/ChannelStrip.svelte`
- Create: `src/lib/components/TopBar.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Create TopBar component**

Create `src/lib/components/TopBar.svelte`:

```svelte
<script lang="ts">
	import { patch } from '$lib/stores/patch.js';
	import { outputPorts, selectedPortId, initMidi } from '$lib/stores/midi.js';
	import { onMount } from 'svelte';

	let midiAvailable = false;

	onMount(async () => {
		midiAvailable = await initMidi();
	});

	function handleBpmChange(e: Event) {
		const value = parseInt((e.target as HTMLInputElement).value);
		if (value > 0 && value <= 300) {
			patch.setBpm(value);
		}
	}

	function handleExport() {
		const json = patch.exportJson();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${$patch.name.toLowerCase().replace(/\s+/g, '-')}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const text = await file.text();
			patch.importJson(text);
		};
		input.click();
	}
</script>

<header class="topbar">
	<div class="logo">Earthwire</div>
	<div class="controls">
		<label>
			BPM
			<input type="number" min="1" max="300" value={$patch.bpm} on:change={handleBpmChange} />
		</label>
		{#if midiAvailable}
			<label>
				MIDI Out
				<select bind:value={$selectedPortId}>
					<option value={null}>None</option>
					{#each $outputPorts as port}
						<option value={port.id}>{port.name}</option>
					{/each}
				</select>
			</label>
		{:else}
			<span class="midi-unavailable">MIDI not available</span>
		{/if}
		<button on:click={handleExport}>Export</button>
		<button on:click={handleImport}>Import</button>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #333;
		background: #1a1a1a;
		color: #fff;
	}
	.logo {
		font-size: 1.25rem;
		font-weight: bold;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	input[type='number'] {
		width: 4rem;
		padding: 0.25rem;
		background: #2a2a2a;
		color: #fff;
		border: 1px solid #444;
		border-radius: 4px;
	}
	select {
		padding: 0.25rem;
		background: #2a2a2a;
		color: #fff;
		border: 1px solid #444;
		border-radius: 4px;
	}
	button {
		padding: 0.25rem 0.75rem;
		background: #333;
		color: #fff;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
	}
	button:hover {
		background: #444;
	}
	.midi-unavailable {
		color: #888;
		font-size: 0.85rem;
	}
</style>
```

- [ ] **Step 2: Create ChannelStrip component**

Create `src/lib/components/ChannelStrip.svelte`:

```svelte
<script lang="ts">
	import type { ChannelConfig } from '$lib/engine/types.js';
	import { patch } from '$lib/stores/patch.js';
	import { createEventDispatcher } from 'svelte';

	export let channel: ChannelConfig;
	export let index: number;

	const dispatch = createEventDispatcher();

	const SOURCES = [
		{ id: 'usgs-earthquakes', name: 'Earthquakes', icon: '🌋' }
	];

	const SOURCE_FIELDS: Record<string, { id: string; name: string }[]> = {
		'usgs-earthquakes': [
			{ id: 'magnitude', name: 'Magnitude' },
			{ id: 'depth', name: 'Depth' },
			{ id: 'latitude', name: 'Latitude' },
			{ id: 'longitude', name: 'Longitude' }
		]
	};

	const SCALES = ['chromatic', 'major', 'minor', 'pentatonic', 'blues', 'dorian', 'mixolydian'];

	function updateChannel(updates: Partial<ChannelConfig>) {
		patch.updateChannel(index, { ...channel, ...updates });
	}

	function handleSourceChange(e: Event) {
		const sourceId = (e.target as HTMLSelectElement).value;
		const fields = SOURCE_FIELDS[sourceId];
		updateChannel({ sourceId, fieldId: fields?.[0]?.id ?? '' });
	}

	function handleSmoothing(e: Event) {
		const amount = parseFloat((e.target as HTMLInputElement).value);
		updateChannel({ smoother: { amount } });
	}

	function remove() {
		patch.removeChannel(index);
	}
</script>

<div class="channel-strip">
	<div class="source-section">
		<select value={channel.sourceId} on:change={handleSourceChange}>
			{#each SOURCES as source}
				<option value={source.id}>{source.icon} {source.name}</option>
			{/each}
		</select>

		<select value={channel.fieldId} on:change={(e) => updateChannel({ fieldId: (e.target as HTMLSelectElement).value })}>
			{#each SOURCE_FIELDS[channel.sourceId] ?? [] as field}
				<option value={field.id}>{field.name}</option>
			{/each}
		</select>
	</div>

	<div class="processing-section">
		<label>
			Norm
			<select
				value={channel.normalizer.mode}
				on:change={(e) => updateChannel({ normalizer: { ...channel.normalizer, mode: (e.target as HTMLSelectElement).value as 'auto' | 'manual' } })}
			>
				<option value="auto">Auto</option>
				<option value="manual">Manual</option>
			</select>
		</label>

		<label>
			Smooth
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={channel.smoother?.amount ?? 0}
				on:input={handleSmoothing}
			/>
		</label>
	</div>

	<div class="output-section">
		<select
			value={channel.output.type}
			on:change={(e) => {
				const type = (e.target as HTMLSelectElement).value;
				if (type === 'midi-cc') updateChannel({ output: { type: 'midi-cc', channel: 1, cc: 1 } });
				else if (type === 'midi-note') updateChannel({ output: { type: 'midi-note', channel: 1 } });
				else if (type === 'midi-trigger') updateChannel({ output: { type: 'midi-trigger', channel: 1, note: 60 } });
				else if (type === 'demo-synth') updateChannel({ output: { type: 'demo-synth', param: 'filter-cutoff' } });
			}}
		>
			<option value="midi-cc">MIDI CC</option>
			<option value="midi-note">MIDI Note</option>
			<option value="midi-trigger">MIDI Trigger</option>
			<option value="demo-synth">Demo Synth</option>
		</select>
	</div>

	<div class="meter">
		<div class="meter-bar" style="width: 0%"></div>
	</div>

	<button class="remove-btn" on:click={remove}>×</button>
</div>

<style>
	.channel-strip {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #333;
		background: #222;
		color: #fff;
	}
	.source-section, .processing-section, .output-section {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	select, input[type='range'] {
		background: #2a2a2a;
		color: #fff;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 0.25rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: #aaa;
	}
	.meter {
		flex: 1;
		height: 8px;
		background: #333;
		border-radius: 4px;
		overflow: hidden;
		min-width: 80px;
	}
	.meter-bar {
		height: 100%;
		background: #4ecdc4;
		transition: width 100ms;
	}
	.remove-btn {
		background: none;
		border: none;
		color: #666;
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0.25rem;
	}
	.remove-btn:hover {
		color: #ff6b6b;
	}
</style>
```

- [ ] **Step 3: Wire up the main page**

Replace `src/routes/+page.svelte` with:

```svelte
<script lang="ts">
	import TopBar from '$lib/components/TopBar.svelte';
	import ChannelStrip from '$lib/components/ChannelStrip.svelte';
	import { patch } from '$lib/stores/patch.js';
	import type { ChannelConfig } from '$lib/engine/types.js';

	function addChannel() {
		const newChannel: ChannelConfig = {
			sourceId: 'usgs-earthquakes',
			fieldId: 'magnitude',
			normalizer: { mode: 'auto' },
			smoother: { amount: 0.3 },
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		};
		patch.addChannel(newChannel);
	}
</script>

<div class="app">
	<TopBar />

	<main class="channels">
		{#each $patch.channels as channel, i (i)}
			<ChannelStrip {channel} index={i} />
		{/each}

		<button class="add-channel" on:click={addChannel}>+ Add Channel</button>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #1a1a1a;
		color: #fff;
	}
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.channels {
		flex: 1;
	}
	.add-channel {
		width: 100%;
		padding: 1rem;
		background: none;
		border: none;
		border-bottom: 1px solid #333;
		color: #4ecdc4;
		font-size: 1rem;
		cursor: pointer;
	}
	.add-channel:hover {
		background: #252525;
	}
</style>
```

- [ ] **Step 4: Verify dev server renders correctly**

```bash
pnpm dev --port 5173 &
sleep 3
curl -s http://localhost:5173 | grep -c "Earthwire"
kill %1
```

Expected: at least 1 match.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TopBar.svelte src/lib/components/ChannelStrip.svelte src/routes/+page.svelte
git commit -m "feat: add basic channel-strip UI with TopBar and main page"
```

---

## Phase 1 — Playable MVP

---

### Task 12: Quantizer Node (TDD)

**Files:**
- Create: `src/lib/nodes/quantizer.ts`
- Create: `src/lib/nodes/quantizer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nodes/quantizer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createQuantizer, SCALES } from './quantizer.js';

describe('quantizer', () => {
	it('quantizes continuous value to nearest MIDI note in chromatic scale', () => {
		const q = createQuantizer({ root: 60, scale: 'chromatic' });
		// 0.5 normalized → middle of 0–127 range → ~64
		const note = q.process(0.5);
		expect(note).toBeGreaterThanOrEqual(0);
		expect(note).toBeLessThanOrEqual(127);
		expect(Number.isInteger(note)).toBe(true);
	});

	it('returns root note for value 0 in major scale', () => {
		const q = createQuantizer({ root: 60, scale: 'major' });
		// Value 0 should map to the lowest note in range
		const note = q.process(0);
		expect(note).toBe(0);
	});

	it('constrains to major scale intervals', () => {
		const q = createQuantizer({ root: 60, scale: 'major' });
		// Major scale from C4: C D E F G A B
		// Intervals: 0, 2, 4, 5, 7, 9, 11
		const note = q.process(60 / 127);
		const majorNotes = new Set<number>();
		for (let oct = 0; oct < 11; oct++) {
			for (const interval of SCALES.major) {
				const n = 12 * oct + interval;
				if (n <= 127) majorNotes.add(n);
			}
		}
		expect(majorNotes.has(note)).toBe(true);
	});

	it('constrains to pentatonic scale', () => {
		const q = createQuantizer({ root: 60, scale: 'pentatonic' });
		const note = q.process(0.5);
		const pentatonicNotes = new Set<number>();
		for (let oct = 0; oct < 11; oct++) {
			for (const interval of SCALES.pentatonic) {
				const n = 12 * oct + interval;
				if (n <= 127) pentatonicNotes.add(n);
			}
		}
		expect(pentatonicNotes.has(note)).toBe(true);
	});

	it('clamps to 0-127 range', () => {
		const q = createQuantizer({ root: 60, scale: 'chromatic' });
		expect(q.process(0.0)).toBeGreaterThanOrEqual(0);
		expect(q.process(1.0)).toBeLessThanOrEqual(127);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/nodes/quantizer.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement quantizer**

Create `src/lib/nodes/quantizer.ts`:

```typescript
import type { QuantizerConfig, ScaleName } from './types.js';

export const SCALES: Record<ScaleName, number[]> = {
	chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
	major: [0, 2, 4, 5, 7, 9, 11],
	minor: [0, 2, 3, 5, 7, 8, 10],
	pentatonic: [0, 2, 4, 7, 9],
	blues: [0, 3, 5, 6, 7, 10],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

export interface Quantizer {
	process(normalizedValue: number): number;
}

export function createQuantizer(config: QuantizerConfig): Quantizer {
	const scaleNotes = buildScaleNotes(config.scale);

	function process(normalizedValue: number): number {
		const rawNote = Math.round(normalizedValue * 127);
		const clamped = Math.max(0, Math.min(127, rawNote));
		return snapToScale(clamped, scaleNotes);
	}

	return { process };
}

function buildScaleNotes(scale: ScaleName): number[] {
	const intervals = SCALES[scale];
	const notes: number[] = [];
	for (let octave = 0; octave < 11; octave++) {
		for (const interval of intervals) {
			const note = octave * 12 + interval;
			if (note <= 127) notes.push(note);
		}
	}
	return notes;
}

function snapToScale(note: number, scaleNotes: number[]): number {
	let closest = scaleNotes[0];
	let minDist = Math.abs(note - closest);
	for (const sn of scaleNotes) {
		const dist = Math.abs(note - sn);
		if (dist < minDist) {
			minDist = dist;
			closest = sn;
		}
	}
	return closest;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/nodes/quantizer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/quantizer.ts src/lib/nodes/quantizer.test.ts
git commit -m "feat: add quantizer node with musical scale snapping (TDD)"
```

---

### Task 13: Threshold Node (TDD)

**Files:**
- Create: `src/lib/nodes/threshold.ts`
- Create: `src/lib/nodes/threshold.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nodes/threshold.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createThreshold } from './threshold.js';
import type { TriggerEvent } from '$lib/engine/types.js';

describe('threshold', () => {
	it('fires on rising crossing', () => {
		const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
		expect(t.process(0.3, Date.now())).toBeNull();
		const trigger = t.process(0.6, Date.now());
		expect(trigger).not.toBeNull();
		expect(trigger!.velocity).toBeGreaterThan(0);
	});

	it('does not fire on falling when direction is rising', () => {
		const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
		t.process(0.6, Date.now());
		expect(t.process(0.4, Date.now())).toBeNull();
	});

	it('fires on falling crossing', () => {
		const t = createThreshold({ level: 0.5, direction: 'falling', beatQuantize: null });
		t.process(0.6, Date.now());
		const trigger = t.process(0.4, Date.now());
		expect(trigger).not.toBeNull();
	});

	it('fires on both directions', () => {
		const t = createThreshold({ level: 0.5, direction: 'both', beatQuantize: null });
		expect(t.process(0.3, Date.now())).toBeNull();
		expect(t.process(0.6, Date.now())).not.toBeNull();
		expect(t.process(0.4, Date.now())).not.toBeNull();
	});

	it('does not re-fire without crossing back', () => {
		const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
		t.process(0.3, Date.now());
		t.process(0.6, Date.now());
		// Still above threshold — should not fire again
		expect(t.process(0.7, Date.now())).toBeNull();
	});

	it('velocity reflects distance past threshold', () => {
		const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
		t.process(0.3, Date.now());
		const trigger = t.process(0.9, Date.now());
		expect(trigger!.velocity).toBeGreaterThan(64);
	});

	it('reset clears state', () => {
		const t = createThreshold({ level: 0.5, direction: 'rising', beatQuantize: null });
		t.process(0.6, Date.now());
		t.reset();
		t.process(0.3, Date.now());
		const trigger = t.process(0.6, Date.now());
		expect(trigger).not.toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/nodes/threshold.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement threshold**

Create `src/lib/nodes/threshold.ts`:

```typescript
import type { ThresholdConfig } from './types.js';
import type { TriggerEvent } from '$lib/engine/types.js';

export interface Threshold {
	process(value: number, timestamp: number): TriggerEvent | null;
	reset(): void;
}

export function createThreshold(config: ThresholdConfig): Threshold {
	let previousValue: number | null = null;
	let wasAbove: boolean | null = null;

	function process(value: number, timestamp: number): TriggerEvent | null {
		const isAbove = value >= config.level;

		if (wasAbove === null) {
			previousValue = value;
			wasAbove = isAbove;
			return null;
		}

		let fired = false;

		if (config.direction === 'rising' || config.direction === 'both') {
			if (!wasAbove && isAbove) fired = true;
		}

		if (config.direction === 'falling' || config.direction === 'both') {
			if (wasAbove && !isAbove) fired = true;
		}

		previousValue = value;
		wasAbove = isAbove;

		if (!fired) return null;

		const distance = Math.abs(value - config.level);
		const velocity = Math.round(Math.min(127, 64 + distance * 127));

		return { timestamp, velocity };
	}

	function reset(): void {
		previousValue = null;
		wasAbove = null;
	}

	return { process, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/nodes/threshold.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/threshold.ts src/lib/nodes/threshold.test.ts
git commit -m "feat: add threshold node with directional trigger detection (TDD)"
```

---

### Task 14: Integrate Quantizer + Threshold into Engine

**Files:**
- Modify: `src/lib/engine/engine.ts`
- Modify: `src/lib/engine/engine.test.ts`

- [ ] **Step 1: Add quantizer/threshold tests to engine**

Add to `src/lib/engine/engine.test.ts`:

```typescript
	it('processes quantizer in chain', () => {
		const engine = new EarthwireEngine();
		engine.addChannel({
			sourceId: 'test',
			fieldId: 'value',
			normalizer: { mode: 'manual', min: 0, max: 127 },
			smoother: null,
			quantizer: { root: 60, scale: 'major' },
			threshold: null,
			output: { type: 'midi-note', channel: 1 }
		});

		const output = engine.processValue(0, 60);
		expect(output.note).not.toBeNull();
		expect(Number.isInteger(output.note)).toBe(true);
	});

	it('processes threshold and emits trigger', () => {
		const engine = new EarthwireEngine();
		engine.addChannel({
			sourceId: 'test',
			fieldId: 'value',
			normalizer: { mode: 'manual', min: 0, max: 100 },
			smoother: null,
			quantizer: null,
			threshold: { level: 0.5, direction: 'rising', beatQuantize: null },
			output: { type: 'midi-trigger', channel: 1, note: 60 }
		});

		engine.processValue(0, 30);
		const output = engine.processValue(0, 80);
		expect(output.trigger).not.toBeNull();
	});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
pnpm test -- src/lib/engine/engine.test.ts
```

Expected: new tests FAIL (quantizer/threshold not wired up yet).

- [ ] **Step 3: Update engine to include quantizer and threshold**

Update `src/lib/engine/engine.ts` to import and use the new nodes:

```typescript
import { createNormalizer, type Normalizer } from '../nodes/normalizer.js';
import { createSmoother, type Smoother } from '../nodes/smoother.js';
import { createQuantizer, type Quantizer } from '../nodes/quantizer.js';
import { createThreshold, type Threshold } from '../nodes/threshold.js';
import type { ChannelConfig, ChannelOutput } from './types.js';

interface ChannelState {
	config: ChannelConfig;
	normalizer: Normalizer;
	smoother: Smoother | null;
	quantizer: Quantizer | null;
	threshold: Threshold | null;
}

export class EarthwireEngine {
	private channels: ChannelState[] = [];

	get channelCount(): number {
		return this.channels.length;
	}

	addChannel(config: ChannelConfig): void {
		this.channels.push({
			config,
			normalizer: createNormalizer(config.normalizer),
			smoother: config.smoother ? createSmoother(config.smoother) : null,
			quantizer: config.quantizer ? createQuantizer(config.quantizer) : null,
			threshold: config.threshold ? createThreshold(config.threshold) : null
		});
	}

	removeChannel(index: number): void {
		this.channels.splice(index, 1);
	}

	processValue(channelIndex: number, rawValue: number): ChannelOutput {
		const channel = this.channels[channelIndex];
		if (!channel) {
			return { continuous: 0, trigger: null, note: null };
		}

		let value = channel.normalizer.process(rawValue);

		if (channel.smoother) {
			value = channel.smoother.process(value);
		}

		const note = channel.quantizer ? channel.quantizer.process(value) : null;

		const trigger = channel.threshold
			? channel.threshold.process(value, Date.now())
			: null;

		return { continuous: value, trigger, note };
	}

	getChannelConfig(index: number): ChannelConfig | undefined {
		return this.channels[index]?.config;
	}
}
```

- [ ] **Step 4: Run all engine tests**

```bash
pnpm test -- src/lib/engine/engine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/engine.ts src/lib/engine/engine.test.ts
git commit -m "feat: integrate quantizer and threshold into engine processing chain"
```

---

### Task 15: ISS Source Adapter + API Proxy

**Files:**
- Create: `src/lib/sources/iss.ts`
- Create: `src/lib/sources/iss.test.ts`
- Create: `src/routes/api/iss/+server.ts`

- [ ] **Step 1: Install satellite.js**

```bash
pnpm add satellite.js
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/sources/iss.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createIssSource, computeIssPosition } from './iss.js';

// Example TLE for ISS (ZARYA)
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test -- src/lib/sources/iss.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement ISS source adapter**

Create `src/lib/sources/iss.ts`:

```typescript
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
	const geo = satellite.eciToGeodetic(posVel.position, gmst);

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
			// Re-compute position every 5 seconds (client-side SGP4, no API call)
			pollInterval = setInterval(computeAndEmit, 5_000);
			// Refresh TLE every 2 hours
			setInterval(fetchTle, 2 * 60 * 60 * 1000);
		},
		disconnect() {
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
			listeners.clear();
		},
		onUpdate(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}
	};
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- src/lib/sources/iss.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Create ISS API proxy**

Create `src/routes/api/iss/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const CACHE_TTL = 3600_000; // 1 hour

let cachedTle: { line1: string; line2: string } | null = null;
let cachedAt = 0;

export const GET: RequestHandler = async () => {
	const now = Date.now();
	if (cachedTle && now - cachedAt < CACHE_TTL) {
		return json(cachedTle, {
			headers: {
				'X-Earthwire-Source': 'CelesTrak',
				'X-Earthwire-Attribution': 'CelesTrak / NASA'
			}
		});
	}

	const res = await fetch(CELESTRAK_URL);
	if (!res.ok) {
		return json({ error: 'CelesTrak API unavailable' }, { status: 502 });
	}

	const text = await res.text();
	const lines = text.trim().split('\n').map((l) => l.trim());
	// TLE format: name line, line 1, line 2
	if (lines.length < 3) {
		return json({ error: 'Invalid TLE response' }, { status: 502 });
	}

	cachedTle = { line1: lines[1], line2: lines[2] };
	cachedAt = now;

	return json(cachedTle, {
		headers: {
			'X-Earthwire-Source': 'CelesTrak',
			'X-Earthwire-Attribution': 'CelesTrak / NASA'
		}
	});
};
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sources/iss.ts src/lib/sources/iss.test.ts src/routes/api/iss/+server.ts
git commit -m "feat: add ISS position source with CelesTrak TLE + SGP4 (TDD)"
```

---

### Task 16: eBird Source Adapter + API Proxy

**Files:**
- Create: `src/lib/sources/ebird.ts`
- Create: `src/lib/sources/ebird.test.ts`
- Create: `src/routes/api/ebird/+server.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/sources/ebird.test.ts`:

```typescript
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
		expect(counts[0].value).toBe(3); // 3 species observed
	});

	it('extracts total individuals', () => {
		const updates = parseEbirdResponse(MOCK_EBIRD_DATA);
		const totals = updates.filter((u) => u.fieldId === 'total-individuals');
		expect(totals).toHaveLength(1);
		expect(totals[0].value).toBe(9); // 3 + 1 + 5
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/sources/ebird.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement eBird source adapter**

Create `src/lib/sources/ebird.ts`:

```typescript
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
			pollInterval = setInterval(poll, 15 * 60_000); // every 15 min
		},
		disconnect() {
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
			listeners.clear();
		},
		onUpdate(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/sources/ebird.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Create eBird API proxy**

Create `src/routes/api/ebird/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types.js';

const EBIRD_BASE = 'https://api.ebird.org/v2/data/obs/US/recent';
const CACHE_TTL = 15 * 60_000; // 15 minutes

let cachedData: unknown = null;
let cachedAt = 0;

export const GET: RequestHandler = async ({ url }) => {
	const regionCode = url.searchParams.get('region') || 'US';

	const now = Date.now();
	if (cachedData && now - cachedAt < CACHE_TTL) {
		return json(cachedData, {
			headers: {
				'X-Earthwire-Source': 'eBird',
				'X-Earthwire-Attribution': 'Cornell Lab of Ornithology'
			}
		});
	}

	const apiKey = env.EBIRD_API_KEY;
	if (!apiKey) {
		return json({ error: 'eBird API key not configured' }, { status: 500 });
	}

	const res = await fetch(`https://api.ebird.org/v2/data/obs/${regionCode}/recent?maxResults=50`, {
		headers: { 'X-eBirdApiToken': apiKey }
	});

	if (!res.ok) {
		return json({ error: 'eBird API unavailable' }, { status: 502 });
	}

	cachedData = await res.json();
	cachedAt = now;

	return json(cachedData, {
		headers: {
			'X-Earthwire-Source': 'eBird',
			'X-Earthwire-Attribution': 'Cornell Lab of Ornithology'
		}
	});
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/ebird.ts src/lib/sources/ebird.test.ts src/routes/api/ebird/+server.ts
git commit -m "feat: add eBird bird activity source adapter and API proxy (TDD)"
```

---

### Task 17: Register All Sources

**Files:**
- Create: `src/lib/sources/index.ts`

- [ ] **Step 1: Create source index that registers all factories**

Create `src/lib/sources/index.ts`:

```typescript
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
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sources/index.ts
git commit -m "feat: add source index registering all MVP source factories"
```

---

### Task 18: Demo Synth

**Files:**
- Create: `src/lib/outputs/demo-synth.ts`

- [ ] **Step 1: Implement demo synth**

Create `src/lib/outputs/demo-synth.ts`:

```typescript
export class DemoSynth {
	private ctx: AudioContext | null = null;
	private osc1: OscillatorNode | null = null;
	private osc2: OscillatorNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private gain: GainNode | null = null;
	private reverb: ConvolverNode | null = null;
	private reverbGain: GainNode | null = null;
	private dryGain: GainNode | null = null;
	private masterGain: GainNode | null = null;
	private _active = false;

	get active(): boolean {
		return this._active;
	}

	async init(): Promise<void> {
		this.ctx = new AudioContext();

		// Oscillators
		this.osc1 = this.ctx.createOscillator();
		this.osc1.type = 'sawtooth';
		this.osc1.frequency.value = 220;

		this.osc2 = this.ctx.createOscillator();
		this.osc2.type = 'square';
		this.osc2.frequency.value = 221; // slight detune

		// Filter
		this.filter = this.ctx.createBiquadFilter();
		this.filter.type = 'lowpass';
		this.filter.frequency.value = 2000;
		this.filter.Q.value = 5;

		// Gains
		this.gain = this.ctx.createGain();
		this.gain.gain.value = 0.3;

		this.masterGain = this.ctx.createGain();
		this.masterGain.gain.value = 0;

		this.dryGain = this.ctx.createGain();
		this.dryGain.gain.value = 0.7;

		this.reverbGain = this.ctx.createGain();
		this.reverbGain.gain.value = 0.3;

		// Simple reverb via delay feedback
		const delay = this.ctx.createDelay();
		delay.delayTime.value = 0.05;
		const feedback = this.ctx.createGain();
		feedback.gain.value = 0.6;

		// Routing
		this.osc1.connect(this.filter);
		this.osc2.connect(this.filter);
		this.filter.connect(this.gain);
		this.gain.connect(this.dryGain);
		this.gain.connect(delay);
		delay.connect(feedback);
		feedback.connect(delay);
		delay.connect(this.reverbGain);
		this.dryGain.connect(this.masterGain);
		this.reverbGain.connect(this.masterGain);
		this.masterGain.connect(this.ctx.destination);

		this.osc1.start();
		this.osc2.start();
	}

	start(): void {
		if (!this.masterGain || !this.ctx) return;
		this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
		this._active = true;
	}

	stop(): void {
		if (!this.masterGain || !this.ctx) return;
		this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
		this._active = false;
	}

	setFilterCutoff(value: number): void {
		if (!this.filter || !this.ctx) return;
		// Map 0-1 to 100-8000 Hz (logarithmic)
		const freq = 100 * Math.pow(80, value);
		this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
	}

	setFilterResonance(value: number): void {
		if (!this.filter || !this.ctx) return;
		this.filter.Q.setTargetAtTime(value * 20, this.ctx.currentTime, 0.02);
	}

	setOscPitch(value: number): void {
		if (!this.osc1 || !this.osc2 || !this.ctx) return;
		// Map 0-1 to 55-880 Hz
		const freq = 55 * Math.pow(16, value);
		this.osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
		this.osc2.frequency.setTargetAtTime(freq * 1.005, this.ctx.currentTime, 0.02);
	}

	setOscDetune(value: number): void {
		if (!this.osc2 || !this.ctx) return;
		this.osc2.detune.setTargetAtTime(value * 50, this.ctx.currentTime, 0.02);
	}

	setReverbMix(value: number): void {
		if (!this.dryGain || !this.reverbGain || !this.ctx) return;
		this.dryGain.gain.setTargetAtTime(1 - value, this.ctx.currentTime, 0.05);
		this.reverbGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
	}

	setWaveform(type: OscillatorType): void {
		if (this.osc1) this.osc1.type = type;
		if (this.osc2) this.osc2.type = type;
	}

	triggerDrum(): void {
		if (!this.ctx) return;
		// Simple noise burst for drum hit
		const bufferSize = this.ctx.sampleRate * 0.1;
		const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
		}
		const source = this.ctx.createBufferSource();
		source.buffer = buffer;
		const drumGain = this.ctx.createGain();
		drumGain.gain.value = 0.5;
		source.connect(drumGain);
		drumGain.connect(this.ctx.destination);
		source.start();
	}

	destroy(): void {
		this.osc1?.stop();
		this.osc2?.stop();
		this.ctx?.close();
		this._active = false;
	}
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/outputs/demo-synth.ts
git commit -m "feat: add demo synth with Web Audio (oscillators, filter, reverb, drum trigger)"
```

---

### Task 19: Signal Meter Canvas Component

**Files:**
- Create: `src/lib/components/SignalMeter.svelte`

- [ ] **Step 1: Create signal meter component**

Create `src/lib/components/SignalMeter.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	export let width = 120;
	export let height = 32;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let buffer: number[] = [];
	const BUFFER_SIZE = 256;
	let animFrame: number;

	onMount(() => {
		ctx = canvas.getContext('2d');
		draw();
	});

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame);
	});

	export function pushValue(value: number): void {
		buffer.push(Math.max(0, Math.min(1, value)));
		if (buffer.length > BUFFER_SIZE) buffer.shift();
	}

	function draw(): void {
		if (!ctx) return;

		ctx.fillStyle = '#1a1a1a';
		ctx.fillRect(0, 0, width, height);

		if (buffer.length < 2) {
			animFrame = requestAnimationFrame(draw);
			return;
		}

		ctx.strokeStyle = '#4ecdc4';
		ctx.lineWidth = 1.5;
		ctx.beginPath();

		const step = width / (BUFFER_SIZE - 1);
		const startIdx = Math.max(0, buffer.length - BUFFER_SIZE);

		for (let i = startIdx; i < buffer.length; i++) {
			const x = (i - startIdx) * step;
			const y = height - buffer[i] * height;
			if (i === startIdx) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();

		// Current value bar
		const current = buffer[buffer.length - 1];
		ctx.fillStyle = '#4ecdc4';
		ctx.globalAlpha = 0.3;
		ctx.fillRect(width - 4, height - current * height, 4, current * height);
		ctx.globalAlpha = 1;

		animFrame = requestAnimationFrame(draw);
	}
</script>

<canvas bind:this={canvas} {width} {height} class="signal-meter"></canvas>

<style>
	.signal-meter {
		border-radius: 4px;
		border: 1px solid #333;
	}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/SignalMeter.svelte
git commit -m "feat: add SignalMeter canvas component with 256-sample ring buffer scope"
```

---

### Task 20: Demo Synth Controls Component

**Files:**
- Create: `src/lib/components/DemoSynthControls.svelte`

- [ ] **Step 1: Create demo synth UI**

Create `src/lib/components/DemoSynthControls.svelte`:

```svelte
<script lang="ts">
	import type { DemoSynth } from '$lib/outputs/demo-synth.js';

	export let synth: DemoSynth | null = null;

	let waveform: OscillatorType = 'sawtooth';
	let filterValue = 0.5;
	let reverbValue = 0.3;

	function handleWaveform(e: Event) {
		waveform = (e.target as HTMLSelectElement).value as OscillatorType;
		synth?.setWaveform(waveform);
	}

	function handleFilter(e: Event) {
		filterValue = parseFloat((e.target as HTMLInputElement).value);
		synth?.setFilterCutoff(filterValue);
	}

	function handleReverb(e: Event) {
		reverbValue = parseFloat((e.target as HTMLInputElement).value);
		synth?.setReverbMix(reverbValue);
	}
</script>

{#if synth}
	<div class="demo-synth-controls">
		<span class="label">Demo Synth</span>

		<label>
			Wave
			<select value={waveform} on:change={handleWaveform}>
				<option value="sawtooth">Saw</option>
				<option value="square">Square</option>
				<option value="sine">Sine</option>
				<option value="triangle">Triangle</option>
			</select>
		</label>

		<label>
			Filter
			<input type="range" min="0" max="1" step="0.01" value={filterValue} on:input={handleFilter} />
		</label>

		<label>
			Reverb
			<input type="range" min="0" max="1" step="0.01" value={reverbValue} on:input={handleReverb} />
		</label>

		<span class="status">{synth.active ? '🔊' : '🔇'}</span>
	</div>
{/if}

<style>
	.demo-synth-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #1e1e1e;
		border-top: 1px solid #333;
		color: #fff;
	}
	.label {
		font-weight: bold;
		font-size: 0.85rem;
		color: #4ecdc4;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: #aaa;
	}
	select {
		background: #2a2a2a;
		color: #fff;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 0.25rem;
	}
	.status {
		margin-left: auto;
	}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/DemoSynthControls.svelte
git commit -m "feat: add DemoSynthControls UI component"
```

---

### Task 21: Landing Hero + "Try It" Flow

**Files:**
- Create: `src/lib/components/LandingHero.svelte`

- [ ] **Step 1: Create landing hero component**

Create `src/lib/components/LandingHero.svelte`:

```svelte
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let isChromium = false;

	import { onMount } from 'svelte';
	onMount(() => {
		isChromium = !!(navigator as any).userAgentData?.brands?.some(
			(b: any) => b.brand === 'Chromium'
		) || /Chrome/.test(navigator.userAgent);
	});
</script>

<div class="hero">
	<h1 class="title">Earthwire</h1>
	<p class="tagline">Stream live data from the planet into your music.</p>

	<p class="description">
		Earthquakes, the ISS, bird migrations — transformed into MIDI signals
		for your DAW, synth, or modular rig. In real time.
	</p>

	<button class="try-it" on:click={() => dispatch('start')}>
		Try it
	</button>

	{#if !isChromium}
		<p class="browser-note">
			The demo synth works in any browser. For MIDI output,
			use Chrome, Edge, Arc, or Brave.
		</p>
	{/if}
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		text-align: center;
		background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);
	}
	.title {
		font-size: 4rem;
		font-weight: 800;
		margin: 0 0 0.5rem;
		background: linear-gradient(135deg, #4ecdc4, #44b09e);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	.tagline {
		font-size: 1.5rem;
		color: #ccc;
		margin: 0 0 1.5rem;
		max-width: 500px;
	}
	.description {
		color: #888;
		max-width: 450px;
		line-height: 1.6;
		margin: 0 0 2rem;
	}
	.try-it {
		padding: 1rem 3rem;
		font-size: 1.25rem;
		font-weight: bold;
		background: linear-gradient(135deg, #4ecdc4, #44b09e);
		color: #000;
		border: none;
		border-radius: 50px;
		cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s;
	}
	.try-it:hover {
		transform: scale(1.05);
		box-shadow: 0 0 30px rgba(78, 205, 196, 0.3);
	}
	.browser-note {
		margin-top: 1.5rem;
		font-size: 0.85rem;
		color: #666;
		max-width: 400px;
	}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/LandingHero.svelte
git commit -m "feat: add landing hero with 'Try it' button and Chromium detection"
```

---

### Task 22: Wire Everything Together on Main Page

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/ChannelStrip.svelte` (add ISS/eBird sources to dropdown)

- [ ] **Step 1: Update ChannelStrip with all MVP sources**

In `src/lib/components/ChannelStrip.svelte`, update the `SOURCES` and `SOURCE_FIELDS` constants:

```typescript
	const SOURCES = [
		{ id: 'usgs-earthquakes', name: 'Earthquakes', icon: '🌋' },
		{ id: 'iss-position', name: 'ISS Position', icon: '🔭' },
		{ id: 'ebird-activity', name: 'Bird Activity', icon: '🐦' }
	];

	const SOURCE_FIELDS: Record<string, { id: string; name: string }[]> = {
		'usgs-earthquakes': [
			{ id: 'magnitude', name: 'Magnitude' },
			{ id: 'depth', name: 'Depth' },
			{ id: 'latitude', name: 'Latitude' },
			{ id: 'longitude', name: 'Longitude' }
		],
		'iss-position': [
			{ id: 'latitude', name: 'Latitude' },
			{ id: 'longitude', name: 'Longitude' },
			{ id: 'altitude', name: 'Altitude' },
			{ id: 'velocity', name: 'Velocity' }
		],
		'ebird-activity': [
			{ id: 'observation-count', name: 'Observation Count' },
			{ id: 'total-individuals', name: 'Total Individuals' },
			{ id: 'species-diversity', name: 'Species Diversity' }
		]
	};
```

- [ ] **Step 2: Update main page with full wiring**

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import TopBar from '$lib/components/TopBar.svelte';
	import ChannelStrip from '$lib/components/ChannelStrip.svelte';
	import DemoSynthControls from '$lib/components/DemoSynthControls.svelte';
	import LandingHero from '$lib/components/LandingHero.svelte';
	import { patch } from '$lib/stores/patch.js';
	import { DemoSynth } from '$lib/outputs/demo-synth.js';
	import { createDefaultRegistry } from '$lib/sources/index.js';
	import { EarthwireEngine } from '$lib/engine/engine.js';
	import type { ChannelConfig } from '$lib/engine/types.js';
	import { onDestroy } from 'svelte';

	let started = false;
	let synth: DemoSynth | null = null;
	let engine: EarthwireEngine | null = null;
	let registry = createDefaultRegistry();

	async function handleStart() {
		synth = new DemoSynth();
		await synth.init();
		synth.start();

		engine = new EarthwireEngine();

		// Load default patch: earthquakes → demo synth filter
		const defaultChannel: ChannelConfig = {
			sourceId: 'usgs-earthquakes',
			fieldId: 'magnitude',
			normalizer: { mode: 'auto' },
			smoother: { amount: 0.3 },
			quantizer: null,
			threshold: null,
			output: { type: 'demo-synth', param: 'filter-cutoff' }
		};
		patch.addChannel(defaultChannel);
		engine.addChannel(defaultChannel);

		// Connect earthquake source and route updates
		try {
			const source = await registry.acquire('usgs-earthquakes');
			source.onUpdate((update) => {
				if (!engine) return;
				const channels = $patch.channels;
				channels.forEach((ch, i) => {
					if (ch.sourceId === update.fieldId || ch.fieldId === update.fieldId) {
						// Match source+field
					}
				});
				// Process through channel 0 for magnitude
				if (update.fieldId === 'magnitude') {
					const output = engine.processValue(0, update.value);
					if (synth && $patch.channels[0]?.output.type === 'demo-synth') {
						synth.setFilterCutoff(output.continuous);
					}
				}
			});
		} catch {
			// Source unavailable, demo synth still works
		}

		started = true;
	}

	function addChannel() {
		const newChannel: ChannelConfig = {
			sourceId: 'usgs-earthquakes',
			fieldId: 'magnitude',
			normalizer: { mode: 'auto' },
			smoother: { amount: 0.3 },
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		};
		patch.addChannel(newChannel);
		engine?.addChannel(newChannel);
	}

	onDestroy(() => {
		synth?.destroy();
	});
</script>

{#if !started}
	<LandingHero on:start={handleStart} />
{:else}
	<div class="app">
		<TopBar />

		<main class="channels">
			{#each $patch.channels as channel, i (i)}
				<ChannelStrip {channel} index={i} />
			{/each}

			<button class="add-channel" on:click={addChannel}>+ Add Channel</button>
		</main>

		<DemoSynthControls {synth} />

		<div class="daw-banner">
			Connect to your DAW for the full experience &mdash;
			<a href="/docs/getting-started" target="_blank">Setup Guide</a>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #1a1a1a;
		color: #fff;
	}
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.channels {
		flex: 1;
	}
	.add-channel {
		width: 100%;
		padding: 1rem;
		background: none;
		border: none;
		border-bottom: 1px solid #333;
		color: #4ecdc4;
		font-size: 1rem;
		cursor: pointer;
	}
	.add-channel:hover {
		background: #252525;
	}
	.daw-banner {
		text-align: center;
		padding: 0.5rem;
		background: #252525;
		color: #888;
		font-size: 0.85rem;
	}
	.daw-banner a {
		color: #4ecdc4;
	}
</style>
```

- [ ] **Step 3: Verify dev server starts and renders**

```bash
pnpm dev --port 5173 &
sleep 3
curl -s http://localhost:5173 | grep -c "Earthwire"
kill %1
```

Expected: at least 1 match.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/lib/components/ChannelStrip.svelte
git commit -m "feat: wire up full app with landing page, demo synth, and source routing"
```

---

### Task 23: Bundled Example Patches

**Files:**
- Create: `patches/examples/seismic-filter-sweep.json`
- Create: `patches/examples/bird-rhythm-generator.json`
- Create: `patches/examples/iss-orbit-pad.json`

- [ ] **Step 1: Create example patches**

Create `patches/examples/seismic-filter-sweep.json`:

```json
{
  "id": "seismic-filter-sweep",
  "name": "Seismic Filter Sweep",
  "specVersion": "0.1.0",
  "bpm": 120,
  "channels": [
    {
      "sourceId": "usgs-earthquakes",
      "fieldId": "magnitude",
      "normalizer": { "mode": "auto" },
      "smoother": { "amount": 0.3 },
      "quantizer": null,
      "threshold": null,
      "output": { "type": "midi-cc", "channel": 1, "cc": 74 }
    },
    {
      "sourceId": "usgs-earthquakes",
      "fieldId": "depth",
      "normalizer": { "mode": "manual", "min": 0, "max": 300 },
      "smoother": { "amount": 0.5 },
      "quantizer": null,
      "threshold": null,
      "output": { "type": "midi-cc", "channel": 1, "cc": 71 }
    }
  ]
}
```

Create `patches/examples/bird-rhythm-generator.json`:

```json
{
  "id": "bird-rhythm-generator",
  "name": "Bird Rhythm Generator",
  "specVersion": "0.1.0",
  "bpm": 110,
  "channels": [
    {
      "sourceId": "ebird-activity",
      "fieldId": "observation-count",
      "normalizer": { "mode": "auto" },
      "smoother": null,
      "quantizer": null,
      "threshold": { "level": 0.6, "direction": "rising", "beatQuantize": "1/8" },
      "output": { "type": "midi-trigger", "channel": 10, "note": 36 }
    },
    {
      "sourceId": "ebird-activity",
      "fieldId": "species-diversity",
      "normalizer": { "mode": "auto" },
      "smoother": { "amount": 0.4 },
      "quantizer": { "root": 60, "scale": "pentatonic" },
      "threshold": null,
      "output": { "type": "midi-note", "channel": 2 }
    }
  ]
}
```

Create `patches/examples/iss-orbit-pad.json`:

```json
{
  "id": "iss-orbit-pad",
  "name": "ISS Orbit Pad",
  "specVersion": "0.1.0",
  "bpm": 80,
  "channels": [
    {
      "sourceId": "iss-position",
      "fieldId": "latitude",
      "normalizer": { "mode": "manual", "min": -90, "max": 90 },
      "smoother": { "amount": 0.7 },
      "quantizer": null,
      "threshold": null,
      "output": { "type": "midi-cc", "channel": 1, "cc": 74 }
    },
    {
      "sourceId": "iss-position",
      "fieldId": "longitude",
      "normalizer": { "mode": "manual", "min": -180, "max": 180 },
      "smoother": { "amount": 0.7 },
      "quantizer": { "root": 48, "scale": "minor" },
      "threshold": null,
      "output": { "type": "midi-note", "channel": 1 }
    },
    {
      "sourceId": "iss-position",
      "fieldId": "velocity",
      "normalizer": { "mode": "manual", "min": 7.5, "max": 7.8 },
      "smoother": { "amount": 0.9 },
      "quantizer": null,
      "threshold": null,
      "output": { "type": "midi-cc", "channel": 1, "cc": 1 }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add patches/examples/
git commit -m "feat: add bundled example patches (seismic, birds, ISS)"
```

---

### Task 24: Patch Save/Load with Examples

**Files:**
- Modify: `src/lib/stores/patch.ts`
- Create: `src/lib/stores/patch.test.ts`

- [ ] **Step 1: Write failing tests for patch store**

Create `src/lib/stores/patch.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { patch } from './patch.js';

describe('patch store', () => {
	beforeEach(() => {
		patch.reset();
	});

	it('starts with default patch', () => {
		const p = get(patch);
		expect(p.name).toBe('Untitled Patch');
		expect(p.channels).toHaveLength(0);
		expect(p.specVersion).toBe('0.1.0');
	});

	it('adds a channel', () => {
		patch.addChannel({
			sourceId: 'test',
			fieldId: 'v',
			normalizer: { mode: 'auto' },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		});
		expect(get(patch).channels).toHaveLength(1);
	});

	it('removes a channel', () => {
		patch.addChannel({
			sourceId: 'test',
			fieldId: 'v',
			normalizer: { mode: 'auto' },
			smoother: null,
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 1 }
		});
		patch.removeChannel(0);
		expect(get(patch).channels).toHaveLength(0);
	});

	it('exports and imports JSON round-trip', () => {
		patch.addChannel({
			sourceId: 'test',
			fieldId: 'v',
			normalizer: { mode: 'auto' },
			smoother: { amount: 0.5 },
			quantizer: null,
			threshold: null,
			output: { type: 'midi-cc', channel: 1, cc: 74 }
		});
		patch.setBpm(140);

		const json = patch.exportJson();
		patch.reset();
		expect(get(patch).channels).toHaveLength(0);

		const success = patch.importJson(json);
		expect(success).toBe(true);
		expect(get(patch).channels).toHaveLength(1);
		expect(get(patch).bpm).toBe(140);
	});

	it('rejects invalid JSON import', () => {
		const success = patch.importJson('not valid json');
		expect(success).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test -- src/lib/stores/patch.test.ts
```

Expected: all tests PASS (patch store already implemented in Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/patch.test.ts
git commit -m "test: add patch store tests for add/remove/export/import (TDD)"
```

---

### Task 25: Vercel Deployment Config

**Files:**
- Create: `vercel.json`
- Create: `.env.example`

- [ ] **Step 1: Create Vercel config**

Create `vercel.json`:

```json
{
  "framework": "sveltekit"
}
```

- [ ] **Step 2: Create env example**

Create `.env.example`:

```
# eBird API key (get one free at https://ebird.org/api/keygen)
EBIRD_API_KEY=your_key_here
```

- [ ] **Step 3: Create .gitignore additions**

Add to `.gitignore` (or create if it doesn't have these):

```
.env
.env.local
```

- [ ] **Step 4: Run full test suite one final time**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel.json .env.example .gitignore
git commit -m "chore: add Vercel deployment config and env example"
```

---

### Task 26: Final Integration Smoke Test

- [ ] **Step 1: Start dev server and verify**

```bash
pnpm dev --port 5173 &
sleep 3
# Verify landing page renders
curl -s http://localhost:5173 | grep "Try it"
# Verify API proxy works
curl -s http://localhost:5173/api/usgs | head -c 200
kill %1
```

Expected: "Try it" found in HTML. USGS proxy returns JSON data.

- [ ] **Step 2: Run all tests one final time**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Type check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit if any fixes were needed**

Only if changes were made during smoke test:

```bash
git add -A
git commit -m "fix: address issues found during integration smoke test"
```
