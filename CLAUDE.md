# sci-beat / Earthwire — CLAUDE.md

> Developer context for AI assistants working on this codebase.

---

## What This Project Is

**Earthwire** (working title; previously "DataBeat") is an open-source web app that ingests live scientific data streams — seismic activity, ISS position, bird migration, ocean sensor data, solar wind — and translates them into MIDI CC/note events, CV/gate signals, and audio triggers. Musicians connect it to synths, DAWs, or the Teenage Engineering OP-1 Field.

There are two primary features:

1. **Live Data → Audio engine** (`/` route): Add channels, each bound to a scientific data source and field, routed through a signal pipeline (normalizer → LFO → smoother → quantizer → threshold) to MIDI, CV, or the built-in demo synth.

2. **Sample Library → OP-1 Drum Kit** (`/samples` route): Browse and search Freesound / Xeno-canto / local files, build a 24-slot drum kit, trim samples, and export as a valid `.aif` file that the OP-1 / OP-1 Field can read directly.

---

## Tech Stack

- **SvelteKit** (Svelte 4, NOT Svelte 5 — do not use `$props()`, `$state()`, `$derived()` runes)
- **TypeScript** strict mode, `.js` extensions on local imports
- **Vitest** for unit tests (`pnpm test`)
- **pnpm** as package manager
- **Vercel** for deployment (`@sveltejs/adapter-vercel`)
- No ORM, no database — all state is in-memory or browser localStorage/IndexedDB

### Key dependencies
- `satellite.js` — ISS orbital propagation
- Web MIDI API (browser native, no npm package)
- Web Audio API (browser native)

---

## Repo Layout

```
src/
  routes/
    +page.svelte              # Main app (data → audio engine)
    samples/+page.svelte      # Sample browser + kit builder
    api/
      usgs/+server.ts         # USGS earthquake proxy
      ebird/+server.ts        # eBird activity proxy
      mbari/+server.ts        # MBARI ocean data proxy
      solar/+server.ts        # NOAA solar wind proxy
      xeno-canto/+server.ts   # Xeno-canto v3 search proxy
      xeno-canto/audio/+server.ts  # Audio stream proxy (CORS bypass)
      freesound/+server.ts    # Freesound search proxy
      iss/+server.ts          # ISS position (no key needed)
    docs/                     # In-app docs pages

  lib/
    engine/
      engine.ts               # EarthwireEngine class — channel processing
      types.ts                # ChannelConfig, PatchConfig, OutputConfig, etc.
      clock.ts                # BPM clock with subdivision ticks
      channel-wiring.ts       # Reactive store → engine sync
      sequencer-transport.ts  # Sequencer play/pause/scrub

    nodes/                    # Pure signal-processing nodes (all tested)
      types.ts                # NormalizerConfig, SmootherConfig, QuantizerConfig, ThresholdConfig, LFOConfig
      normalizer.ts / .test.ts
      smoother.ts / .test.ts  # Modes: smooth, deep-smooth, glide, step
      quantizer.ts / .test.ts # Maps 0-1 to MIDI notes via scale
      threshold.ts / .test.ts # Edge-detect triggers with beat quantize
      lfo.ts / .test.ts       # 5 shapes: sine, triangle, square, saw, rsaw

    sources/                  # Data source adapters
      types.ts                # EarthwireSource, SourceField, SourceUpdate, SequencerState
      registry.ts             # SourceRegistry — factory pattern
      index.ts                # createDefaultRegistry() — registers all 5 sources
      usgs.ts / usgs-sequencer.ts
      iss.ts / iss-sequencer.ts
      ebird.ts / ebird-sequencer.ts
      mbari-sequencer.ts
      solar-sequencer.ts
      sequencer-source.ts     # Base class for sequencer-style sources

    outputs/
      midi.ts                 # Web MIDI output (CC, note, trigger)
      cv-output.ts            # CV/gate via Web Audio AudioWorklet
      demo-synth.ts           # Built-in demo synth (Web Audio)

    kit/
      types.ts                # SlotMeta, KitMeta, DeviceMode, DEVICE_LIMITS, SLOT_COLORS
      audio-processor.ts      # extractPeaks, extractPeaksRange, trimBuffer, normalizeBuffer, cloneAudioBuffer, stitchBuffers
      aiff-encoder.ts         # Encodes Float32Array → valid AIFF binary
      op1-metadata.ts         # Builds OP-1 APPL chunk JSON for drum kit slot timings

    stores/
      patch.ts                # Svelte writable — current PatchConfig (channels)
      kit.ts                  # Svelte writable — KitMeta + PCM snapshot map (24 slots; stores Float32Arrays not AudioBuffers)
      clock.ts                # BPM clock store
      audio-player.ts         # Preview player (plays slot audio with trim)
      midi.ts                 # MIDI port store
      monitor.ts              # DataMonitor signal store
      my-sounds.ts            # IndexedDB-backed local file store
      drag.ts                 # Drag-and-drop state

    util/
      logger.ts

    components/
      ChannelStrip.svelte     # Per-channel UI (source, pipeline nodes, output)
      SignalMeter.svelte       # Animated bar showing live 0-1 signal value
      TopBar.svelte            # App chrome (BPM, transport, patch load/save)
      DemoSynthControls.svelte # Demo synth knobs
      DataMonitor.svelte       # Live signal monitor overlay
      LandingHero.svelte       # Splash / entry screen

      KitBuilder.svelte        # 24-slot drum kit panel + export button
      SegmentBar.svelte        # Duration bar showing per-slot colored segments (clickable to preview)
      SlotRow.svelte           # One drum kit slot row (✂ trim editor toggle)
      WaveformTrimA.svelte     # Canvas waveform trim editor (variant A — stable, imperative draw)
      WaveformTrimB.svelte     # SVG waveform trim editor (variant B — colored trim region)
      WaveformTrim.svelte      # Original trim component (kept for reference)

      SampleBrowser.svelte     # Tab container for sample search sources
      FreesoundTab.svelte      # Freesound.org search
      BirdSoundsTab.svelte     # Xeno-canto bird recording search
      XenocantoTab.svelte      # Xeno-canto browse/explore
      MySoundsTab.svelte       # Local file upload (IndexedDB)
```

---

## Signal Pipeline (per channel)

Data flows through nodes in this order:

```
Raw source value
  → Normalizer   (0–1 via auto or manual min/max)
  → LFO          (optional oscillation blend, depth 0=passthrough 1=pure LFO)
  → Smoother     (EMA / glide / step)
  → Quantizer    (optional, maps to MIDI scale)
  → Threshold    (optional, edge-detect trigger with beat quantize)
  → Output       (MIDI CC / MIDI note / MIDI trigger / CV / demo-synth)
```

Node interfaces are all in `src/lib/nodes/types.ts`. Each node is a pure factory (`createLFO`, `createSmoother`, etc.) returning a stateful object with a `process(value)` method. No side effects.

**LFO specifics:** `process(input, nowSec?)` — `nowSec` is optional (defaults to `Date.now()/1000`) but always pass it explicitly in tests to avoid wall-clock dependency.

---

## OP-1 Drum Kit Export

The kit export pipeline:

1. Each of the 24 slots has `trimStart`/`trimEnd` (seconds into the source buffer)
2. On export, each slot's buffer is trimmed via `trimBuffer(buf, start, end, channels, sr)`
3. If total duration exceeds device limit (12s OP-1 / 20s OP-1 Field), last slot(s) are clipped to fit — **export is never blocked**
4. All trimmed buffers are stitched end-to-end via `stitchBuffers()`
5. OP-1 APPL chunk JSON is built with slot timings via `buildOp1Metadata()`
6. Encoded to AIFF binary via `encodeAiff()` and downloaded as `.aif`
7. If any Freesound samples are included, a `-credits.txt` sidecar is also downloaded

Device modes:
- `op1`: mono, 16-bit, 12s max
- `op1field`: stereo, 24-bit, 20s max

---

## Data Sources

| ID | Name | API | Key required |
|----|------|-----|--------------|
| `usgs-earthquakes` | USGS Earthquakes | USGS public API | No |
| `iss-position` | ISS Position | Open Notify / satellite.js | No |
| `ebird-activity` | eBird Activity | eBird API v2 | Yes (`EBIRD_API_KEY`) |
| `mbari-ocean` | MBARI Ocean | MBARI public | No |
| `solar-wind` | Solar Wind | NOAA SWPC | No |

All source data is fetched server-side (SvelteKit API routes) to avoid CORS and hide API keys.

---

## Environment Variables

Set in `.env` (see `.env.example`):

```
EBIRD_API_KEY=         # Required for eBird source
FREESOUND_CLIENT_ID=   # Required for Freesound tab in sample browser
# XENO_CANTO_KEY=      # Optional — keyless currently works
```

---

## Commands

```bash
pnpm dev          # Dev server (usually :5173 or :5174)
pnpm build        # Production build
pnpm check        # svelte-check + tsc
pnpm test         # Vitest (run all tests)
pnpm test <file>  # Run a specific test file
npx tsc --noEmit  # TypeScript check only
```

---

## Active Branch: `Tempo_Trainer`

This is the main working branch. `main` is the stable base.

### What's been built on this branch

- **WaveformTrimA/B**: Two waveform trim editor variants for A/B testing. Variant A uses an imperative canvas (stable height — no Svelte reactivity touches canvas dimensions). Variant B uses SVG with colored bars inside the trim region. Both have zoom: Fit / + / − / Full.
- **LFO nodes**: Full LFO implementation with 5 shapes, depth blend, wired into engine pipeline. UI in ChannelStrip.
- **Drum kit export fixes**: Export never blocks on over-budget kits (auto-clips last sample). Progress bar appears below footer during export.
- **SegmentBar click-to-preview**: Clicking a colored segment previews that slot's sound.
- **Sample browser layout**: Browser panel `max-width: 55%`, kit panel `min-width: 380px / max-width: 45%` — kit is more prominent.
- **Xeno-canto v3 API**: Upgraded from v2 to v3 endpoint.
- **Silent export fix**: Freesound and Xeno-canto samples exported as silence when previewed before exporting. Root cause: Chrome/Brave recycle the native memory backing a decoded `AudioBuffer` after a `BufferSourceNode` finishes playing it; subsequent `getChannelData()` calls return zeros. Fixed at two layers: (1) FreesoundTab/XenocantoTab snapshot raw `Float32Array`s immediately at decode time (`pcmCache`), (2) `kit.ts` stores `{ sr, nch, ch: Float32Array[] }` snapshots instead of `AudioBuffer` objects, reconstructing a fresh `new AudioBuffer` on every `getBuffer()` call. `trimBuffer` already used `new AudioBuffer({...})` (pure JS heap) rather than `ctx.createBuffer()` (audio thread pool) — maintain this distinction.
- **Cross-browser download fixes**: Safari treated `audio/x-aiff` as a streamable media type and truncated the download when `URL.revokeObjectURL` was called before its async download manager had finished reading. Fixed by: (1) using `application/octet-stream` MIME type, (2) appending anchor to `document.body` before `.click()`, (3) revoking the object URL after a 60-second delay. Brave fingerprinting protection (Shields) can zero out Web Audio `getChannelData()` results; this is now detected at add-time and surfaces a Brave-specific error message (`'brave' in navigator`).
- **OP-1 Field AIFF export**: Full AIFC sowt 16-bit format with FVER chunk, 64-byte AIFC COMM, 4100-byte APPL (4096-byte JSON block padded with spaces, newline after closing `}`), scaled fixed-point start/end positions (`0x7FFFFFFE` = full device window), all 24 slots always have `start < end` (empty slots get unique 1-frame silence regions appended to SSND). Metadata values (`fx_params`, `lfo_params`, `fx_type`, `lfo_type`, `playmode`, `octave`, `dyna_env`) matched against confirmed-working hardware-generated kits. Audio encoded as 16-bit little-endian (sowt) via `aiff-encoder.ts`.
- **Landing page**: Two CTAs — "Start Listening" (live engine) and "Build a Kit →" (`/samples`). Waveform decoration removed.
- **Site footer**: Creator links (GitHub, idw3d.com, Etsy) in `src/routes/+layout.svelte` — renders on all pages.

### Known pending / future work

- LFO BPM sync (rate as note division, locked to clock)
- Phase offset per channel (detune multiple LFOs)
- LFO-modulated rate (env data controls LFO speed)
- VCV Rack plugin
- OSC output
- More data sources (ocean buoys, air quality, lightning)

---

## Coding Conventions

- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- **No trailing summaries** in responses — user can read the diff
- **Svelte 4 only** — no `$state()`, `$props()`, `$derived()` runes
- **`.js` extensions** on all local TS imports (SvelteKit ESM requirement)
- **Factory pattern** for nodes — `createX(config): X` returning `{ process, reset }` — no classes
- **Tests use explicit `nowSec`** — never rely on wall clock in node tests
- All node tests live adjacent to the implementation (`lfo.test.ts` next to `lfo.ts`)
- Prefer editing existing files over creating new ones
- TypeScript must compile clean (`npx tsc --noEmit`) before committing

---

## Testing

```bash
pnpm test                              # All tests
pnpm test src/lib/nodes/lfo.test.ts    # One file
```

Test count as of last update: 131 tests, all passing.

Key test files:
- `src/lib/nodes/*.test.ts` — all signal nodes
- `src/lib/engine/engine.test.ts` — EarthwireEngine
- `src/lib/stores/patch.test.ts` — patch store
- `src/lib/kit/aiff-encoder.test.ts` — AIFF encoding
- `src/lib/kit/op1-metadata.test.ts` — OP-1 metadata

---

## Waveform Trim — Implementation Note

The canvas waveform (WaveformTrimA) has a subtle stability constraint: if Svelte's reactive system touches any canvas attribute (`width`, `height`) after mount, the browser clears the canvas. The fix:

- `let viewEnd = 0` at declaration (not `= fullDuration`) — prevents any reactive computation before mount
- Canvas dimensions set **only** in `onMount`
- All drawing is imperative (`redraw()` called from `onMount` and zoom buttons only)
- `startPct`/`endPct` are still reactive — they only affect CSS positions, never the canvas

Peak normalization ensures bars always fill the full height regardless of the absolute amplitude in the zoomed window (`peaks = raw.map(p => p / Math.max(...raw, 0.0001))`).
