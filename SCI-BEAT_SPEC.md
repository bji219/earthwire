# DataBeat — Project Specification & Architecture

> **Version:** 0.1.0-draft  
> **Status:** Pre-scaffolding brainstorm  
> **License (proposed):** MIT  
> **Tagline:** Stream live scientific data into MIDI, CV, and audio — make music from the planet.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Core Concepts](#2-core-concepts)
3. [Data Sources](#3-data-sources)
4. [Signal Pipeline Architecture](#4-signal-pipeline-architecture)
5. [Output Targets](#5-output-targets)
6. [Bioacoustic Sample Library](#6-bioacoustic-sample-library)
7. [OP-1 Integration](#7-op-1-integration)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Backend / Edge Services](#9-backend--edge-services)
10. [VCV Rack Plugin](#10-vcv-rack-plugin)
11. [Tech Stack Decisions](#11-tech-stack-decisions)
12. [Repo Structure](#12-repo-structure)
13. [Open Source Strategy](#13-open-source-strategy)
14. [Licensing & Data Attribution](#14-licensing--data-attribution)
15. [Roadmap](#15-roadmap)
16. [Open Questions](#16-open-questions)

---

## 1. Vision & Goals

DataBeat is an open-source web application that ingests live and historical scientific data streams and translates them into MIDI CC/note events, OSC messages, and CV/gate signals. Musicians can connect DataBeat to any MIDI-capable software or hardware — Logic Pro, Ableton Live, VCV Rack, hardware synths, the Teenage Engineering OP-1 — and use real planetary, biological, and network phenomena as live performance controllers or generative composition engines.

### Primary goals

- **Zero install for MIDI users.** The Web MIDI API works natively in Chromium browsers on macOS, Windows, and Linux. macOS users route through the built-in IAC Driver; Windows users through loopMIDI (free, ~2MB). No VST, no plugin, no Electron app required for the core use case.
- **Open source and community-driven.** MIT licensed. Patch format is a plain JSON file that anyone can share. A community registry of patches lives in the repo under `patches/community/`.
- **Scientific integrity.** Every data source is credited with its originating institution, license, and update cadence. Data is never fabricated or interpolated beyond what is disclosed to the user.
- **Musical usefulness over novelty.** Signals are normalized, smoothable, quantizable to musical scales, and triggerable at musically meaningful thresholds. This is a music tool first, a data visualizer second.

### Non-goals (v1)

- No audio engine. DataBeat outputs control signals only (MIDI, OSC, CV). Sample export for the OP-1 is the one exception and is treated as a separate workflow module.
- No cloud user accounts. Patches save to localStorage and can be exported as JSON files.
- No real-time collaboration in v1 (interesting future feature, see §16).

---

## 2. Core Concepts

### Patch

A **patch** is the fundamental unit of DataBeat. It is a JSON document that describes a complete signal routing session:

```json
{
  "id": "seismic-filter-sweep",
  "name": "Seismic filter sweep",
  "description": "USGS earthquake magnitude → filter cutoff, depth → resonance",
  "version": "1.0.0",
  "sources": [ ... ],
  "nodes": [ ... ],
  "connections": [ ... ],
  "outputs": [ ... ]
}
```

Patches are portable, human-readable, and version-controlled. They are the sharable artifact of the community.

### Source

A **source** is a configured data feed — a specific API endpoint, polling interval, geographic filter, and field selector. A source emits a stream of timestamped scalar or vector values.

### Node

A **node** is a processing unit in the signal chain. Nodes are composable and chainable:

| Node type | Function |
|---|---|
| `normalizer` | Scale raw values to 0.0–1.0 using historical min/max or user-defined range |
| `smoother` | Apply exponential moving average, slew limiter, or sample-and-hold |
| `quantizer` | Snap to MIDI note values; optionally constrain to a musical scale |
| `threshold` | Emit a trigger event when the signal crosses a defined level |
| `lfo_shape` | Modulate the signal with an LFO synced to a BPM clock |
| `math` | Arithmetic operations: add, multiply, invert, power curve |
| `merge` | Combine two signals (sum, multiply, max, min) |
| `clock_divider` | Divide or multiply a BPM-synced trigger |
| `recorder` | Buffer the last N seconds of signal for playback/looping |

### Connection

A **connection** is a directed edge from a source output or node output to a node input or output target. The connection carries a typed signal: `continuous` (0.0–1.0), `trigger` (momentary), or `note` (pitch + velocity + duration).

### Output target

An **output target** is a configured destination for the processed signal. See §5 for full details.

---

## 3. Data Sources

All sources are polled or streamed over HTTPS. No sources require authentication in v1 (all public APIs). Sources are defined as plugins — adding a new source requires only a new source adapter module.

### 3.1 Geophysical

| Source | Provider | Update cadence | Signal type | API |
|---|---|---|---|---|
| Earthquake feed | USGS | Real-time, ~1–5 min | Magnitude (0–10), depth (km), location | GeoJSON feed |
| Volcano tremor | USGS HVO | ~1 min | Tremor amplitude | USGS Volcano Hazards |
| Geomagnetic Kp index | NOAA SWPC | 3-hour cadence | Kp (0–9) | NOAA JSON |
| Wave height buoys | NOAA NDBC | ~10 min | Wave height (m), period (s) | NDBC text/XML |
| Tide gauge | NOAA CO-OPS | 6 min | Water level (m) | CO-OPS API |

### 3.2 Space & Atmospheric

| Source | Provider | Update cadence | Signal type | API |
|---|---|---|---|---|
| Solar wind speed | NASA DSCOVR / NOAA | ~1 min | Speed (km/s), density, Bz | NOAA SWPC JSON |
| ISS position | NASA / Open Notify | ~5 sec | Lat, lon, altitude, velocity | Open Notify API |
| Aurora (Kp proxy) | NOAA SWPC | 3-hour | Kp index → aurora probability | NOAA JSON |
| CO₂ (Mauna Loa) | NOAA GML | Daily | ppm concentration | NOAA CSV |
| UV index | OpenUV / EPA | Hourly | UV index (0–12+) | OpenUV API |

### 3.3 Biological & Environmental

| Source | Provider | Update cadence | Signal type | API |
|---|---|---|---|---|
| Bird activity | Cornell BirdNET-Pi (local) | Real-time | Detection confidence, species freq | Local HTTP or MQTT |
| Ocean hydrophone | MBARI MARS | Continuous stream | Audio amplitude, spectral bands | MBARI public stream |
| Lightning strikes | Blitzortung | Real-time | Strike density (per region/min) | WebSocket |
| Air quality (AQI) | OpenAQ | Hourly | AQI (0–500+) | OpenAQ API |

### 3.4 Network & Computational

| Source | Provider | Update cadence | Signal type | API |
|---|---|---|---|---|
| Internet latency map | Various (RIPE Atlas) | ~1 min | RTT (ms) per region | RIPE Atlas API |
| Wikipedia edit rate | Wikimedia | Real-time | Edits/minute globally | EventStream SSE |
| GitHub commit rate | GitHub | Real-time | Commits/min across public repos | GitHub Events API |
| Global BGP updates | RouteViews / RIPE RIS | ~30 sec | BGP update count | RIS Live WebSocket |

### 3.5 Source adapter interface

Every source implements a common TypeScript interface:

```typescript
interface DataBeatSource {
  id: string;
  name: string;
  description: string;
  license: string;
  attribution: string;
  fields: SourceField[];          // Selectable scalar outputs
  connect(): Promise<void>;
  disconnect(): void;
  onUpdate: (cb: (data: SourceUpdate) => void) => void;
}

interface SourceUpdate {
  timestamp: number;              // Unix ms
  fieldId: string;
  value: number;
  raw: unknown;                   // Original API response for debugging
}
```

---

## 4. Signal Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        DataBeat app                          │
│                                                              │
│  Sources          Processing nodes         Output targets    │
│  ────────         ────────────────         ──────────────    │
│  USGS ──┐                                                    │
│  NOAA ──┼──► Normalizer ──► Smoother ──► Quantizer ──► MIDI │
│  NASA ──┤         │                           │              │
│  Wiki ──┘    Threshold ──────────────────► Trigger out       │
│                   │                                          │
│              LFO shape ──► Math ──────────────────► OSC      │
│                                                              │
│  Clock source (internal BPM or Ableton Link / MIDI clock)    │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Signal types

| Type | Range | Description |
|---|---|---|
| `continuous` | 0.0 – 1.0 (float) | Normalized continuous value, maps to CC or CV |
| `trigger` | momentary | Boolean pulse, maps to note-on, gate, or CC 127→0 |
| `note` | pitch 0–127, vel 0–127 | Full MIDI note event with duration |
| `clock` | BPM float | Master tempo reference |

### 4.2 Normalizer node

The normalizer is always the first node after a source. It handles three modes:

- **Auto:** Tracks rolling min/max over a configurable window (default 24h). Self-calibrating but takes time to stabilize.
- **Manual:** User defines explicit min/max. Stable immediately, may clip outliers.
- **Percentile:** Uses historical percentile distribution. Robust to outliers; requires historical data preload.

### 4.3 Clock and tempo

DataBeat maintains an internal BPM clock (default 120 BPM, adjustable). The clock is used by:

- `lfo_shape` nodes for tempo-synced modulation
- `clock_divider` nodes for rhythmic triggering
- Ableton Link sync (optional, Chromium extension or companion app required)
- Outgoing MIDI clock messages to slaved hardware

The data itself can *become* the clock: a `threshold` node on earthquake frequency can drive a variable-tempo clock, so more seismic activity = faster tempo.

### 4.4 Processing graph

The node graph is a directed acyclic graph (DAG). Cycles are not permitted (they would cause infinite loops with no audio-rate processing). The graph is evaluated left-to-right on each incoming data tick.

Evaluation is synchronous within a tick. Nodes are topologically sorted on patch load. If a source update arrives mid-evaluation, it queues for the next tick.

---

## 5. Output Targets

### 5.1 Web MIDI API (primary)

DataBeat uses the browser's native `navigator.requestMIDIAccess()` API. On grant:

- Lists all available MIDI output ports (hardware and virtual)
- Sends `noteOn`, `noteOff`, `controlChange`, `pitchBend`, `clock`, and `sysEx` messages
- Supports multi-channel output (channels 1–16 configurable per connection)

**macOS routing:** IAC Driver virtual port → Logic Pro, GarageBand, or any Core MIDI app. Zero additional software.

**Windows routing:** loopMIDI virtual port → same topology.

**Linux routing:** JACK or ALSA virtual port.

### 5.2 Logic Pro specifics

Logic sees DataBeat's IAC output as a standard hardware MIDI input.

| Feature | How DataBeat feeds it |
|---|---|
| Smart Controls (8 knobs) | CC 1–8 on configured channel |
| Scripter MIDI FX | Receives raw CC; JS inside Logic transforms further |
| Step Sequencer | Note events on MIDI clock sync |
| Automation lanes | CC recorded in real time to an automation lane |
| Environment layer | DataBeat → IAC → Environment → fan-out to multiple instruments |

### 5.3 Ableton Live specifics

| Feature | How DataBeat feeds it |
|---|---|
| MIDI Map mode | CC → any mappable parameter |
| Clip launch | Note triggers → clip slots |
| Ableton Link | Optional tempo sync via Link (requires companion script or browser extension) |
| Max for Live | Can receive DataBeat's OSC stream directly if `udpreceive` is set up |

### 5.4 OSC output

OSC (Open Sound Control) is output via a local WebSocket-to-UDP bridge (a tiny companion Node/Deno process, ~50 lines). This enables:

- VCV Rack via `VCV-OSC` or `stoermelder-packone` MIDI-CV
- Max/MSP and Pure Data directly
- TouchOSC, Lemur bridging to hardware controllers
- SuperCollider

OSC address pattern follows: `/databeat/{patchId}/{sourceId}/{fieldId}` with a float payload in 0.0–1.0.

### 5.5 VCV Rack (dedicated plugin — phase 2)

A native VCV Rack plugin is the ideal VCV integration. It would:

- Appear as a module in the browser
- Open a WebSocket connection to the DataBeat web app on localhost
- Expose 8 CV outputs and 4 gate outputs per module instance
- Allow stacking multiple instances for more channels

The plugin is a separate deliverable from the web app. Rack SDK is open source; the plugin would be MIT licensed and submitted to the VCV Library.

---

## 6. Bioacoustic Sample Library

### 6.1 Source catalog

| Source | Type | License | Access |
|---|---|---|---|
| Cornell Macaulay Library | Bird, marine, wildlife audio | Non-commercial with attribution (confirm via API ToS) | REST API, `ml.macaulaylibrary.org` |
| MBARI MARS hydrophone | Deep ocean, whale, ship noise | Public, attribution required | Direct stream / file download |
| NOAA Passive Acoustics | Marine mammal, ocean noise | US Government — public domain | NCEI portal |
| freesound.org | Field recordings, nature sounds | CC0 / CC-BY (filterable) | REST API with key |
| xeno-canto | Bird sounds globally | CC (varies per recording) | REST API |

### 6.2 Sample browser workflow (UI)

```
1. Search / browse by source, taxon, location, or recording type
2. Preview audio in browser (HTML5 Audio)
3. Select a recording
4. View waveform with auto-detected slice points
5. Adjust slice points manually (drag handles on waveform)
6. Configure export target:
     a. OP-1 drum kit (24-slot AIFF bundle)
     b. Ableton Drum Rack (.adg + wav files)
     c. Logic EXS24 / Quick Sampler pack
     d. Generic SFZ format (universal)
     e. Raw WAV stems (normalized, named by pitch)
7. Export
```

### 6.3 OP-1 drum kit export

The OP-1 (original) and OP-1 Field both accept sample import via USB. The Field uses standard mass storage; the original uses a specific directory structure.

**Technical requirements for OP-1 Field samples:**
- Format: AIFF or WAV
- Sample rate: 44100 Hz
- Bit depth: 16-bit
- Max file size: ~12 seconds per slot
- Directory: `/audio/drums/` on the OP-1 Field's USB mass storage

**Slot-to-MIDI-note mapping (OP-1 drum machine):**

The OP-1 drum machine has 24 sample slots. In MIDI, these map to notes C2–B3 (notes 36–59 in standard MIDI numbering):

| Slot | MIDI note | Suggested use |
|---|---|---|
| 1 | C2 (36) | Kick |
| 2 | C#2 (37) | Snare |
| 3 | D2 (38) | Closed hat |
| 4 | D#2 (39) | Open hat |
| 5–8 | E2–G#2 | Percussion fills |
| 9–16 | A2–D#3 | Tonal/melodic hits |
| 17–24 | E3–B3 | FX / atmosphere |

**Auto-slicer algorithm:**
1. Load audio into Web Audio API `AudioBuffer`
2. Run onset detection (energy threshold + spectral flux)
3. Group onsets with minimum 100ms silence separation
4. Rank slices by onset energy (loudest → slot 1, etc.)
5. Trim each slice to 12s max, apply 5ms fade-in and 50ms fade-out
6. Normalize each slice to -3 dBFS
7. Encode as 44100 Hz / 16-bit AIFF using client-side JS (no server round-trip)
8. Package into a zip with correct filenames and directory structure

### 6.4 Spectral synthesis mode

Rather than exporting raw slices, spectral synthesis mode generates a new sound *inspired by* the source:

1. FFT analysis of a selected window of the source audio
2. Extract top N harmonic partials by amplitude
3. Synthesize a new single-cycle waveform from those partials
4. Optionally export as an OP-1 synth user wavetable

This produces sounds that are tonally related to nature recordings but are much shorter and more suitable as synth oscillators.

---

## 7. OP-1 Integration

### 7.1 MIDI drum patterns from data

The OP-1 drum sequencer has a 16-step grid per pattern, with up to 4 bars. Each step can trigger any of the 24 drum slots. DataBeat can generate OP-1-compatible MIDI drum patterns from scientific data:

**Pattern generation approaches:**

| Approach | Data source | How it maps |
|---|---|---|
| Seismic rhythm | USGS earthquake timestamps | P-wave/S-wave arrival times → step positions; magnitude → velocity |
| Pulsar timing | Jodrell Bank / ATNF pulsar catalog | Pulsar period quantized to 16-step grid; multiple pulsars = polyrhythm |
| Geomagnetic density | NOAA Kp index | Kp 0–3 = sparse pattern; Kp 7–9 = full density fill |
| Tidal variation | NOAA tide gauge | Tidal phase → pattern length variation (odd meter) |
| Bird detection events | BirdNET-Pi | Detection timestamps → step triggers; confidence → velocity |

**MIDI output for OP-1 drum patterns:**
- Output on MIDI channel 10 (standard drum channel) or user-configured
- Note numbers follow the slot map above (C2–B3)
- DataBeat's clock drives the step sequencer tempo
- Patterns loop as 1-bar, 2-bar, or 4-bar phrases

### 7.2 OP-1 synth patch generation

The OP-1 accepts SysEx patch dumps for its synthesis engines. This is undocumented but reverse-engineered by the community (OP-1 hacking community on `op-forums.com` and GitHub).

Known writable engines: `Cluster`, `DNA`, `Voltage`, `Sampler`

**Data-seeded patch generation:**
- Scientific data values seed the engine parameter bytes
- E.g., earthquake magnitude seeds `Cluster` grain density; solar wind speed seeds `Voltage` frequency
- Parameters are constrained to known valid ranges
- Output is a `.json` or `.aif` sysex blob that can be transferred to the OP-1

This is exploratory — reliable SysEx generation depends on community-maintained parameter maps.

---

## 8. Frontend Architecture

### 8.1 Framework

**SvelteKit** — chosen for:
- Lightweight runtime (no virtual DOM overhead, important for 60fps signal visualization)
- First-class TypeScript support
- Excellent Web Audio API ergonomics
- Static adapter for Netlify deployment (consistent with your existing idw3d.com setup)
- Built-in stores for reactive signal state

### 8.2 Key UI areas

```
┌─────────────────────────────────────────────────────────────┐
│  Topbar: patch name, BPM, clock source, save/share          │
├───────────────┬─────────────────────────────────────────────┤
│  Source panel │  Patch canvas (node graph)                  │
│  ─────────── │  ─────────────────────────                  │
│  Browse/add  │  Drag-and-drop nodes                         │
│  sources     │  Click connections to configure               │
│               │  Live signal meters on each wire             │
├───────────────┴─────────────────────────────────────────────┤
│  Output panel: configured MIDI/OSC targets, per-channel     │
├─────────────────────────────────────────────────────────────┤
│  Sample browser (collapsible drawer)                        │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 State management

- **Patch state:** Svelte store, serializes to JSON for save/share
- **Signal state:** Ring buffer per wire, last 256 values, drives live meters
- **MIDI state:** Singleton MIDI access object, reactive port list
- **Clock state:** `AudioContext`-based clock for sub-millisecond timing accuracy (do not use `setInterval` for MIDI timing)

### 8.4 Visualization

- Node graph rendered on HTML5 Canvas (not SVG — performance at 60fps with live signal animation)
- Signal scopes on each wire: mini oscilloscope view, 256-sample ring buffer
- Global scope panel: full-width waveform of any selected signal
- Waveform editor for sample slicer: uses `WaveSurfer.js` or custom Canvas renderer

---

## 9. Backend / Edge Services

DataBeat is primarily a static client-side app. Backend is minimal by design.

### 9.1 API proxy (edge function)

Some data sources have CORS restrictions or rate limits that require a thin server proxy.

**Deployment:** Netlify Edge Functions (Deno runtime) or Cloudflare Workers

**Endpoints:**

| Route | Purpose |
|---|---|
| `GET /api/usgs/earthquakes` | Proxy USGS GeoJSON, cache 60s |
| `GET /api/noaa/solar-wind` | Proxy NOAA SWPC JSON, cache 60s |
| `GET /api/macaulay/search` | Proxy Macaulay Library API with attribution headers |
| `GET /api/freesound/search` | Proxy freesound.org (key kept server-side) |
| `WS /api/blitzortung` | WebSocket proxy for lightning data |

All proxy responses include a `X-DataBeat-Source`, `X-DataBeat-License`, and `X-DataBeat-Attribution` header so the UI can always display provenance.

### 9.2 Community patch registry

A GitHub-backed registry. Patches are submitted as PRs to `patches/community/` in the repo. A GitHub Action validates the JSON schema on PR. The web app fetches the registry index from a CDN-cached GitHub raw URL.

No database, no accounts, no server costs.

### 9.3 OSC bridge (optional local companion)

For users who need OSC (VCV Rack, Max/MSP, etc.), a tiny local companion process bridges the browser's WebSocket to UDP OSC:

```
DataBeat (browser) ──WebSocket──► osc-bridge (localhost:3000) ──UDP──► VCV Rack / Max
```

The bridge is a single-file Deno script (~60 lines). Users run it with `deno run --allow-net osc-bridge.ts`. No npm install required.

---

## 10. VCV Rack Plugin

Phase 2 deliverable. Outline only.

- Module name: **DataBeat CV**
- 8 CV outputs (±5V, mapped from 0.0–1.0 normalized signal)
- 4 gate outputs (trigger on threshold events)
- WebSocket client connecting to `ws://localhost:PORT` (DataBeat's local WS server)
- Port configurable via right-click menu
- Visual: signal activity LEDs per channel, connection status indicator
- Built with Rack SDK v2, C++17
- MIT licensed, submitted to VCV Library

---

## 11. Tech Stack Decisions

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | SvelteKit | Performance, reactivity, static deploy |
| Language | TypeScript throughout | Type safety for signal graph, node interfaces |
| MIDI | Web MIDI API (native) | No library needed for basic use; `webmidi.js` for ergonomics |
| Audio / sample processing | Web Audio API + `AudioWorklet` | Client-side, no server round-trip for sample export |
| Canvas / visualization | HTML5 Canvas 2D API | 60fps signal scopes without SVG overhead |
| Waveform display | WaveSurfer.js or custom Canvas | Mature, well-maintained; custom fallback if needed |
| AIFF encoding | `audiobuffer-to-wav` + custom AIFF header writer | Pure JS, no WASM dependency |
| Edge functions | Netlify Edge / Cloudflare Workers | Deno runtime, zero cold start, consistent with Netlify stack |
| OSC bridge | Deno script | Single file, no install, cross-platform |
| VCV plugin | C++17, Rack SDK v2 | Required by Rack ecosystem |
| Package manager | `pnpm` | Faster than npm, good monorepo support |
| Monorepo | `pnpm workspaces` | Web app + OSC bridge + VCV plugin in one repo |
| Testing | Vitest (unit), Playwright (E2E) | Native ESM support, fast |
| CI | GitHub Actions | Free, integrates with patch registry |
| Deployment | Netlify (static + edge functions) | Consistent with your existing stack |

---

## 12. Repo Structure

```
databeat/
├── apps/
│   └── web/                        # SvelteKit app
│       ├── src/
│       │   ├── lib/
│       │   │   ├── sources/        # Source adapter modules
│       │   │   │   ├── usgs.ts
│       │   │   │   ├── noaa-solar.ts
│       │   │   │   ├── macaulay.ts
│       │   │   │   └── index.ts    # Source registry
│       │   │   ├── nodes/          # Processing node implementations
│       │   │   │   ├── normalizer.ts
│       │   │   │   ├── smoother.ts
│       │   │   │   ├── quantizer.ts
│       │   │   │   └── ...
│       │   │   ├── outputs/        # Output target adapters
│       │   │   │   ├── midi.ts
│       │   │   │   ├── osc-ws.ts
│       │   │   │   └── ...
│       │   │   ├── engine/         # Patch graph evaluator, clock
│       │   │   │   ├── graph.ts
│       │   │   │   ├── clock.ts
│       │   │   │   └── scheduler.ts
│       │   │   ├── sampler/        # Bioacoustic sample browser + slicer
│       │   │   │   ├── browser.ts
│       │   │   │   ├── slicer.ts
│       │   │   │   ├── aiff-encoder.ts
│       │   │   │   └── op1-export.ts
│       │   │   └── stores/         # Svelte stores (patch, MIDI, clock)
│       │   ├── routes/             # SvelteKit pages
│       │   └── app.html
│       └── netlify/
│           └── edge-functions/     # API proxies
│               ├── usgs.ts
│               ├── noaa.ts
│               └── macaulay.ts
├── packages/
│   └── patch-schema/               # JSON Schema for patch format
│       ├── schema.json
│       └── validate.ts
├── tools/
│   └── osc-bridge/                 # Deno OSC bridge script
│       └── bridge.ts
├── vcv-plugin/                     # VCV Rack DataBeat CV module (phase 2)
│   ├── src/
│   └── plugin.json
├── patches/
│   ├── examples/                   # Bundled example patches
│   │   ├── seismic-filter-sweep.json
│   │   ├── solar-wind-pad.json
│   │   └── op1-birdcall-kit.json
│   └── community/                  # Community-submitted patches (PR-gated)
├── docs/
│   ├── getting-started.md
│   ├── sources.md
│   ├── nodes.md
│   ├── op1-guide.md
│   └── vcv-guide.md
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── validate-patches.yml
├── DATABEAT_SPEC.md                # This document
├── CONTRIBUTING.md
├── LICENSE                         # MIT
└── package.json                    # pnpm workspace root
```

---

## 13. Open Source Strategy

### License

MIT. No CLA required for contributions. Patch submissions (JSON files) are considered CC0.

### Community touchpoints

- GitHub Discussions for feature requests and patch sharing
- `patches/community/` PR workflow as described above
- A `#databeat` channel suggested for existing synth/modular Discord servers (lines.community, VCV Rack official, OP-1 community)

### Plugin / extension points

Third-party developers can add sources and nodes without forking:

- **Custom source:** Implement `DataBeatSource` interface, publish as an npm package with the `databeat-source-` prefix
- **Custom node:** Implement `DataBeatNode` interface, same convention
- The UI will support loading custom modules via import URL in settings (phase 2)

---

## 14. Licensing & Data Attribution

Every piece of data displayed or exported by DataBeat must carry attribution. This is both ethical practice and a legal requirement for several source licenses.

| Source | License | Attribution requirement |
|---|---|---|
| USGS data | Public domain (US Gov) | Credit USGS, link to source |
| NOAA data | Public domain (US Gov) | Credit NOAA, link to source |
| NASA data | Public domain (US Gov) | Credit NASA, specific mission |
| Cornell Macaulay Library | Non-commercial + attribution | Credit recordist + ML catalog number |
| freesound.org (CC-BY) | Creative Commons BY | Credit author + freesound ID |
| freesound.org (CC0) | Public domain | No requirement, but credit anyway |
| MBARI | Attribution required | Credit MBARI, link to MARS project |
| xeno-canto | CC (per recording, varies) | Check per recording before export |

The sample export workflow must include a `CREDITS.txt` in every zip archive listing all source recordings used, their recordists, catalog numbers, and license terms.

---

## 15. Roadmap

### Phase 0 — Foundation (weeks 1–4)

- [ ] Repo scaffolding (monorepo, pnpm, TypeScript, SvelteKit)
- [ ] Patch JSON schema + validator
- [ ] Core engine: graph evaluator, clock, signal types
- [ ] First 3 sources: USGS earthquakes, NOAA solar wind, Wikipedia edit rate
- [ ] Normalizer and smoother nodes
- [ ] Web MIDI output (CC and note)
- [ ] Basic patch canvas UI (no fancy visuals yet — functional first)
- [ ] IAC Driver setup guide in docs

### Phase 1 — Usable MVP (weeks 5–10)

- [ ] Full source catalog (all §3 sources)
- [ ] All node types
- [ ] Logic Pro and Ableton Live integration guides
- [ ] OSC bridge tool
- [ ] Patch save/load (JSON export/import)
- [ ] Example patches bundled
- [ ] Live signal scopes on patch canvas
- [ ] Netlify deploy + edge function proxies
- [ ] Community patch registry (GitHub PR workflow)

### Phase 2 — Sampler & OP-1 (weeks 11–18)

- [ ] Sample browser (freesound + Macaulay Library)
- [ ] Waveform viewer + manual slicer
- [ ] Auto-slicer (onset detection)
- [ ] OP-1 drum kit export (AIFF bundle)
- [ ] Ableton Drum Rack export
- [ ] Logic Quick Sampler / EXS24 export
- [ ] SFZ export
- [ ] Credits/attribution in export zip

### Phase 3 — VCV & Advanced (weeks 19–26)

- [ ] VCV Rack DataBeat CV plugin
- [ ] Spectral synthesis mode for sample generation
- [ ] OP-1 SysEx patch generation (experimental)
- [ ] Historical data playback (scrub through archived datasets)
- [ ] Custom source/node import via URL
- [ ] Collaborative patch sharing (real-time, same patch, multiple users — WebRTC)

---

## 16. Open Questions

These need decisions before or during Phase 0:

1. **Browser support target.** Web MIDI API is Chromium-only (Chrome, Edge, Arc, Brave). Firefox and Safari do not support it. Do we accept this limitation, or build an Electron wrapper for broader support? Recommendation: accept Chromium-only for v1, document clearly, revisit if demand warrants.

2. **BirdNET-Pi local source.** The local BirdNET-Pi integration is unique (it's your own hardware). Should it be a first-class source adapter, or an advanced/custom source that users configure with a local URL? Recommendation: custom HTTP source with a BirdNET-Pi preset template — generalizes to any local HTTP data source.

3. **Freesound API key distribution.** The freesound API requires a key. Options: (a) users register their own key and paste it in settings; (b) proxy through edge function with a shared key (rate limit risk); (c) both, with shared key as fallback. Recommendation: option (c).

4. **Clock source accuracy.** `AudioContext.currentTime` is the most accurate browser clock but requires an unlocked AudioContext (user gesture needed). Plan: prompt for a click to unlock on first use, then use AudioContext for all MIDI timing.

5. **OP-1 vs OP-1 Field differences.** The Field uses standard USB mass storage for samples; the original OP-1 uses a custom protocol. Supporting both is complexity. Recommendation: Field first (simpler), original OP-1 via documented manual transfer instructions.

6. **Patch format versioning.** The JSON schema will evolve. Define a semver-compatible migration strategy from day one. Recommendation: include `"specVersion": "0.1.0"` in every patch, write a migration runner in `patch-schema/migrate.ts`.

7. **Name.** "DataBeat" is working title. Check npm, GitHub, and domain availability before committing.
