# sci-beat / Earthwire — CLAUDE.md

> Developer context for AI assistants working on this codebase.

---

## What This Project Is

**Earthwire** (working title; previously "DataBeat") is an open-source web app that ingests live scientific data streams — seismic activity, ISS position, bird migration, ocean sensor data, solar wind — and translates them into MIDI CC/note events, CV/gate signals, and audio triggers. Musicians connect it to synths, DAWs, or the Teenage Engineering OP-1 Field.

There are two primary features:

1. **Sample Library → OP-1 Drum Kit** (`/` route): Browse and search Freesound / Xeno-canto / local files, build a 24-slot drum kit, trim samples, and export as a valid `.aif` file that the OP-1 / OP-1 Field can read directly. This is the headline tool.

2. **Live Data → Audio engine** (`/sequencer` route): Add channels, each bound to a scientific data source and field, routed through a signal pipeline (normalizer → LFO → smoother → quantizer → threshold) to MIDI, CV, or the built-in demo synth.

`/samples` is kept as a 308 redirect to `/` for backwards compatibility.

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
    +page.svelte              # Kit Designer (sample browser + kit builder) — landing
    sequencer/+page.svelte    # Live data → audio engine
    samples/+page.ts          # 308 redirect to /
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
      lfo-source.ts           # LFO pseudo-source (bypasses registry, uses setInterval in channel-wiring)
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

      SampleBrowser.svelte     # Tab container: My Sounds / Freesound / Bird Sounds
      FreesoundTab.svelte      # Freesound.org search (category chips + infinite scroll)
      XenocantoTab.svelte      # Xeno-canto bird recordings (family chips, type filter, infinite scroll)
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

### Per-slot playback mode

Each `SlotMeta` has a `playMode: 'oneshot' | 'loop' | 'gate' | 'reverse'` (default `'oneshot'`). The kit store exposes `setSlotPlayMode(i, mode)` and `cyclePlayMode(i)`; the latter advances through `PLAY_MODE_CYCLE` and is wired to a toggle button on `SlotRow` (next to the ✂ trim icon, dispatches the `cyclemode` event). Icons/labels are exported from `src/lib/kit/types.ts` as `PLAY_MODE_ICON` and `PLAY_MODE_LABEL`.

At export time, `op1-metadata.ts` translates the string mode to two orthogonal OP-1 APPL integer arrays. Codes confirmed via the operator1/op1 wiki, schollz/teoperator, padenot/libop1, and joseph-holland/op-patchstudio:

| Mode    | `playmode` | `reverse` |
|---------|-----------:|----------:|
| oneshot | 4096       | 12000     |
| loop    | 20480      | 12000     |
| gate    | 8192       | 12000     |
| reverse | 4096       | 18432     |

The `reverse=12000` "forward" value is preserved from the previous baseline (matched against the verified-working `808.aif` Field kit) rather than switching to the research-canonical `8192`, to avoid regressing already-working exports.

In the kit editor, previewing a slot whose `playMode === 'reverse'` plays the trimmed region back-to-front. `audioPlayer.play()` takes an optional `reverse` flag; when true it builds a frame-reversed `AudioBuffer` (using `new AudioBuffer({...})` per the kit-store rule, never `ctx.createBuffer`) and plays the whole buffer from position 0. Loop and gate previews are intentionally not implemented in the kit editor — they are export-only behaviors on the OP-1 itself.

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

## Current State (main branch)

All work is on `main`. Last commit: `957ded9`.

### What's been built

- **Per-slot playback mode toggle**: Each `SlotMeta` carries a `playMode` (`oneshot` / `loop` / `gate` / `reverse`). `SlotRow` shows a cycle button next to ✂; icon and accent reflect the current mode. Stored in `kit.ts` and migrated for old patches. `audio-player.ts` accepts a `reverse` flag so the in-app preview plays back-to-front when reverse is selected. `op1-metadata.ts` translates to per-slot `playmode` (4096/20480/8192/4096) and `reverse` (12000/12000/12000/18432) integers. Codes from operator1/op1 wiki, schollz/teoperator, padenot/libop1.
- **WaveformTrimA/B**: Two waveform trim editor variants. Variant A: imperative canvas (stable — Svelte reactivity must never touch canvas `width`/`height` after mount). Variant B: SVG with colored trim region. Both have zoom: Fit / + / − / Full.
- **LFO source + engine**: Full LFO as a standalone channel source (`sourceId: 'lfo'`), driven by a per-channel `setInterval` in `channel-wiring.ts`. 5 shapes: sine, triangle, square, saw, rsaw. Depth blend wired into the engine pipeline. `🎛` icon used in channel strip and signal monitor.
  - **LFO pauses with transport**: `ChannelWiringManager.setPlaying(playing)` sets a `paused` flag; the interval callback skips phase advancement when paused. `lastTick` is always updated so there's no phase jump on resume.
  - **LFO live config**: The `setInterval` callback reads `channelConfig.lfoConfig` fresh from the engine each tick — shape/rate changes apply within 16ms without needing a wire reconnect.
- **Demo synth mute button**: `DemoSynthControls` accepts an `active` prop from `+page.svelte` and dispatches a `togglemute` event. The parent calls `synth.start()/stop()` and updates `synthPlaying`, which flows back as the prop. Svelte 4 class mutation problem bypassed by lifting state to parent.
- **FOUC fix**: CSS custom properties and body baseline moved to an inline `<style>` in `src/app.html` so they render before JS hydration. Duplicate `:global(:root)` blocks removed from Svelte components.
- **Channel duplication fix**: Default channel only added when `channels.length === 0` in `+page.svelte` `onMount`, preventing channels doubling on every page refresh.
- **Multi-select in My Sounds tab**: Shift-click for range selection; normal click plays/previews. `selectedIds: Set<string>`, `lastClickedId` anchor. Bulk delete bar appears when `selectedIds.size > 0`.
- **Multi-select in Kit editor**: Shift-click range selection via `SlotRow` `select` event → `KitBuilder.handleSlotSelect`. `selectedSlots: Set<number>`. Backspace/Delete clears selected slots. Bulk bar at `selectedSlots.size > 1`. Normal click activates + previews and clears selection.
- **Sample browser tab consolidation**: `BirdSoundsTab.svelte` deleted. `SampleBrowser` now has 3 tabs: My Sounds, Freesound, Bird Sounds — Bird Sounds renders `XenocantoTab` directly.
- **XenocantoTab redesign**: Family quick-filter chips (12 families), full 30-type recording type dropdown (multi-word types quoted: `type:"alarm call"`), infinite scroll via `IntersectionObserver` with `root: resultsList` (the actual scroll container), recording type badge on result rows. Section label: `N results · more available · Xeno-canto`.
- **FreesoundTab**: 12 category chips (Kick, Snare, Hi-hat, etc.), infinite scroll with `IntersectionObserver` (`root: resultsList`), `hasMore = !!data.next`.
- **Drum kit export fixes**: Export never blocks on over-budget kits (auto-clips last sample). Progress bar below footer during export.
- **SegmentBar click-to-preview**: Clicking a colored segment previews that slot's sound.
- **Silent export fix**: `pcmCache` snapshots raw `Float32Array`s at decode time. `kit.ts` stores `{ sr, nch, ch: Float32Array[] }` and reconstructs `new AudioBuffer` on every `getBuffer()` call. Never use `ctx.createBuffer()` (audio thread pool) for stored samples — always `new AudioBuffer({...})` (JS heap).
- **Cross-browser download fixes**: `application/octet-stream` MIME, anchor appended to body before `.click()`, `URL.revokeObjectURL` deferred 60s. Brave Shields zeroing detected via `'brave' in navigator`.
- **OP-1 Field AIFF export**: AIFC sowt 16-bit, FVER chunk, 64-byte COMM, 4100-byte APPL (4096-byte JSON + newline), `0x7FFFFFFE` fixed-point positions, 24 slots always `start < end` (empty slots get 1-frame silence regions).
- **Landing pages (per-route, first-visit only)**: Both `/` (Kit Designer) and `/sequencer` show a `LandingHero` on first visit, gated by `localStorage` keys `earthwire.seen.kit` and `earthwire.seen.sequencer`. `LandingHero` accepts copy/CTA props (`overline`, `tagline`, `description`, `primaryLabel`, `secondaryLabel`, `secondaryHref`, `docsHref`, `showMidiNote`). Each hero has a primary CTA, a secondary link to the other tool, and a tertiary "Getting Started →" link to `/docs/getting-started`.
- **Site footer**: Creator links in `src/routes/+layout.svelte`.
- **Xeno-canto v3 API**: Tagged query format (`en:robin`), multi-word types quoted (`type:"alarm call"`).

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

Test count as of last update: 133 tests, all passing (16 test files).

Key test files:
- `src/lib/nodes/*.test.ts` — all signal nodes
- `src/lib/engine/engine.test.ts` — EarthwireEngine
- `src/lib/engine/clock.test.ts` — BPM clock
- `src/lib/stores/patch.test.ts` — patch store
- `src/lib/kit/aiff-encoder.test.ts` — AIFF encoding
- `src/lib/kit/op1-metadata.test.ts` — OP-1 metadata
- `src/lib/kit/audio-processor.test.ts` — trim/stitch/peak utilities
- `src/lib/sources/*.test.ts` — ISS, eBird source adapters
- `src/lib/outputs/midi.test.ts` — MIDI output

---

## Waveform Trim — Implementation Note

The canvas waveform (WaveformTrimA) has a subtle stability constraint: if Svelte's reactive system touches any canvas attribute (`width`, `height`) after mount, the browser clears the canvas. The fix:

- `let viewEnd = 0` at declaration (not `= fullDuration`) — prevents any reactive computation before mount
- Canvas dimensions set **only** in `onMount`
- All drawing is imperative (`redraw()` called from `onMount` and zoom buttons only)
- `startPct`/`endPct` are still reactive — they only affect CSS positions, never the canvas

Peak normalization ensures bars always fill the full height regardless of the absolute amplitude in the zoomed window (`peaks = raw.map(p => p / Math.max(...raw, 0.0001))`).
