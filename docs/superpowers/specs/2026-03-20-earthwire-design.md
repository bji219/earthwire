# Earthwire — Design Specification

> **Version:** 0.1.0
> **Status:** Approved design
> **Date:** 2026-03-20
> **Tagline:** Stream live data from the planet into your music.

---

## 1. Vision

Earthwire is an open-source web application that ingests live scientific data streams and translates them into MIDI CC/note events, OSC messages, and audio control signals. Musicians connect Earthwire to any MIDI-capable software or hardware — Logic Pro, Ableton Live, VCV Rack, hardware synths, the OP-1 — and use real planetary and biological phenomena as live performance controllers or generative composition engines.

A built-in demo synth lets anyone hear the data sonified immediately, with no setup required.

### Primary goals

- **Zero install for MIDI users.** Web MIDI API works natively in Chromium browsers. macOS users route through IAC Driver; Windows users through loopMIDI. No plugin, no Electron app.
- **Instant gratification.** First-time visitors click "Try it" and immediately hear live earthquake data controlling a synth. No MIDI setup needed for the demo experience.
- **Musical usefulness over novelty.** Signals are normalized, smoothable, quantizable to musical scales, and triggerable at musically meaningful thresholds. This is a music tool first, a data visualizer second.
- **Open source and community-driven.** MIT licensed. Patches are shareable JSON files.
- **Scientific integrity.** Every data source is credited with its originating institution, license, and update cadence.

### Non-goals (v1)

- No full audio engine. Demo synth is for preview only; real use is MIDI/OSC output.
- No cloud user accounts. Patches save to localStorage and export as JSON.
- No VCV Rack native plugin (phase 2).
- No OP-1 sample export or SysEx generation (phase 2).
- No bioacoustic sample browser (phase 2).
- No real-time collaboration.

---

## 2. Target Users

1. **The builder (primary):** A musician who uses Logic Pro and/or hardware like the OP-1, comfortable with MIDI routing, wants scientific data as a creative input for music production.
2. **Intermediate electronic musicians:** People comfortable with DAWs and MIDI but not necessarily programmers. They want an interesting tool to experiment with.
3. **Modular/experimental community (stretch):** People used to patching and signal routing. The OSC/CV output path serves them.
4. **Curious visitors:** People who land on the site, click "Try it," and hear what earthquakes sound like. The demo synth serves them.

---

## 3. Core Architecture

### Data flow

```
Data Source → Source Adapter → Normalizer → Processing Chain → Output Target
                                              (smoother,        (Web MIDI,
                                               quantizer,        OSC bridge,
                                               threshold)        Demo Synth)
```

### Source adapter interface

Every source produces the same shape: a stream of timestamped scalar values. The engine never knows or cares whether the number came from an earthquake or a bird.

```typescript
interface EarthwireSource {
  id: string;
  name: string;
  icon: string;                  // visual identity: "volcano", "telescope", "bird", etc.
  description: string;
  attribution: SourceAttribution;
  fields: SourceField[];         // selectable scalar outputs (e.g. magnitude, depth)
  connect(): Promise<void>;
  disconnect(): void;
  onUpdate(cb: (update: SourceUpdate) => void): () => void; // returns unsubscribe function
}

interface SourceField {
  id: string;
  name: string;
  unit: string;                  // e.g. "magnitude", "km", "degrees"
  expectedRange: [number, number]; // hint for normalizer
}

interface SourceUpdate {
  timestamp: number;             // Unix ms
  fieldId: string;
  value: number;
  raw: unknown;                  // original API response for debugging
}

interface SourceAttribution {
  provider: string;
  license: string;
  url: string;
}
```

### Signal types

| Type | Range | Description |
|---|---|---|
| `continuous` | 0.0–1.0 (float) | Normalized continuous value, maps to CC or CV |
| `trigger` | momentary | Boolean pulse, maps to note-on, gate, or CC 127→0 |
| `note` | pitch 0–127, vel 0–127 | Full MIDI note event with duration |

### Processing chain

Each channel has a fixed chain order (each stage optional/bypassable):

1. **Normalizer** — scale raw values to 0.0–1.0
   - Auto mode: rolling min/max over configurable window
   - Manual mode: user-defined min/max
2. **Smoother** — exponential moving average with adjustable amount (0.0 = raw, 1.0 = very smooth)
3. **Quantizer** — snap to MIDI note values, optionally constrain to a musical scale (chromatic, major, minor, pentatonic, etc.)
4. **Threshold** — emit trigger events when signal crosses a defined level (configurable direction: rising, falling, both). Triggers can optionally be quantized to the nearest beat subdivision (1/4, 1/8, 1/16) using the engine clock.

The processing chain is output-agnostic. It produces normalized values and trigger events. The output target at the end of each channel decides how to translate that into MIDI, OSC, or demo synth parameters.

### Engine

The engine is a plain TypeScript module with no UI dependencies:

- Holds the list of active channels
- Evaluates each channel's processing chain on every data tick
- Emits output events to registered output targets
- Maintains an internal BPM clock (AudioContext-based for accuracy)
- Testable in isolation

### Clock

- Internal BPM clock (default 120, adjustable) using `AudioContext.currentTime`
- Used by threshold nodes for rhythmic quantization of triggers
- User gesture required to unlock AudioContext (handled by "Try it" button)
- MIDI clock output deferred to Phase 2 (most DAW users run their own clock)

---

## 4. Data Sources

All sources are polled or streamed over HTTPS. Sources are defined as adapters — adding a new source requires only implementing the `EarthwireSource` interface. Some sources (eBird) require API keys; these are held server-side in Vercel API route proxies so the browser never sees them.

### Phase 1 — MVP (3 sources)

| Source | Icon | Provider | Update cadence | Key fields | API |
|---|---|---|---|---|---|
| Earthquakes | 🌋 | USGS | ~1–5 min | Magnitude, depth (km), location | GeoJSON feed |
| ISS Position | 🔭 | CelesTrak / NASA | ~5 sec | Latitude, longitude, altitude, velocity | CelesTrak GP API (TLE→SGP4 computed client-side) |
| Bird Activity | 🐦 | Cornell eBird | ~15 min | Observation count, species diversity by region | eBird API 2.0 |

### Phase 2 — Fast-follows (3 sources)

| Source | Icon | Provider | Update cadence | Key fields | API |
|---|---|---|---|---|---|
| Ocean Hydrophone | 🐋 | MBARI MARS | Continuous | Audio amplitude, spectral bands | MBARI public stream |
| Wave Height / Tides | 🌊 | NOAA NDBC / CO-OPS | ~6–10 min | Wave height (m), period (s), water level | NDBC / CO-OPS API |
| Lightning Strikes | ⚡ | Blitzortung | Real-time | Strike density per region/minute | WebSocket |

### Phase 3 — Expansion

| Source | Icon | Provider | Update cadence | Key fields | API |
|---|---|---|---|---|---|
| Solar Wind | ☀️ | NASA DSCOVR / NOAA | ~1 min | Speed (km/s), density, Bz component | NOAA SWPC JSON |

Additional natural phenomenon sources can be added over time. The adapter interface makes each one an independent, self-contained module.

### Source instance sharing

Source adapters are singletons: one instance per source type, managed by a source registry (`sources/index.ts`). If two channels both use "Earthquakes / Magnitude," they share the same source instance and receive the same updates. This avoids duplicate API calls and simplifies rate limit management. The registry reference-counts consumers and calls `disconnect()` when the last channel using a source is removed.

### Error handling

When a source API fails or times out:
- The channel displays a "stale data" indicator (timestamp of last successful update)
- The last received value is held — no silent drops to zero
- The source adapter retries with exponential backoff (1s, 2s, 4s, max 30s)
- After 5 consecutive failures, the channel shows an error state with a manual retry button

### Attribution

Every source displays its provider, license, and data link in the UI. This is both ethical practice and a legal requirement for several source licenses (USGS, NOAA, Cornell).

---

## 5. Output Targets

### 5.1 Web MIDI API (primary)

- Browser-native `navigator.requestMIDIAccess()` — Chromium only (Chrome, Edge, Arc, Brave)
- Enumerate available MIDI output ports on load
- Each channel strip targets a specific MIDI port + channel (1–16)
- Output modes per channel:
  - **CC** — continuous control (0–127)
  - **Note** — quantizer output determines pitch, normalized value determines velocity, threshold triggers determine note-on timing
  - **Trigger** — note-on/off pulses from threshold events
- macOS: IAC Driver → Logic Pro (zero additional software)
- Windows: loopMIDI → any DAW
- Linux: JACK or ALSA virtual port

### 5.2 OSC Bridge (secondary)

For VCV Rack, Max/MSP, SuperCollider, and other OSC-capable software:

- A tiny Deno script (~60 lines) run locally by the user
- Browser sends WebSocket → bridge converts to UDP OSC
- Address pattern: `/earthwire/{channelIndex}/{fieldId}` with float payload 0.0–1.0 (channelIndex is the 0-based position in the patch; reordering channels changes OSC addresses)
- UI shows connection status indicator (green/red dot)
- User runs: `deno run --allow-net osc-bridge.ts`

### 5.3 Demo Synth (built-in preview)

- Web Audio API: 2 oscillators + filter + reverb + basic drum sampler
- Not a real instrument — just enough to make data audible for visitors
- Each channel can optionally route to demo synth parameters:
  - Filter cutoff, resonance
  - Oscillator pitch, detune
  - Drum hit triggers
  - Reverb mix
- A banner encourages "Connect to your DAW for the full experience"
- Demo synth fades out automatically when a real MIDI device is selected

---

## 6. User Interface

### Layout: Channel-strip mixer

Single-page application. No routing, no modals, no multi-page navigation.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Topbar: Earthwire logo | BPM | Clock controls | MIDI device | Save │
├──────────────────────────────────────────────────────────────────────┤
│  Channel 1                                                           │
│  [🌋 Earthquakes ▼] [Magnitude ▼] [Norm: auto ▼] [Smooth: 0.3]     │
│  [Quantize: off ▼] [Threshold: --] → [MIDI CC 1, Ch 1 ▼] ████░░░░  │
├──────────────────────────────────────────────────────────────────────┤
│  Channel 2                                                           │
│  [🔭 ISS Position ▼] [Latitude ▼] [Norm: manual ▼] [Smooth: 0.5]   │
│  [Quantize: C min ▼] [Threshold: --] → [MIDI Note, Ch 2 ▼] ██░░░░  │
├──────────────────────────────────────────────────────────────────────┤
│  [+ Add Channel]                                                     │
├──────────────────────────────────────────────────────────────────────┤
│  Demo Synth: [Waveform ▼] [Filter ———●———] [Reverb ———●———] 🔊     │
└──────────────────────────────────────────────────────────────────────┘
```

Each channel strip contains:
1. **Source selector** — dropdown with distinctive icons per source
2. **Field selector** — which value from that source
3. **Processing controls** — normalizer mode, smoothing amount, quantize scale, threshold level
4. **Output target** — MIDI CC/Note/Trigger + channel, and/or OSC, and/or demo synth param
5. **Live signal meter** — real-time Canvas visualization of the processed value

### Visual identity

Each data source has a distinctive icon/illustration (volcano, telescope, bird, whale, wave, lightning bolt, sun). These appear in the source selector and in the signal meters, giving the app personality and making it immediately understandable.

### Signal meters

Rendered on HTML5 Canvas for 60fps performance. Each channel shows a mini scope of the last 256 processed values — a tiny oscilloscope view that makes the data feel alive.

---

## 7. First-Time Experience

1. **Landing hero** — animated visualization of live earthquake data with Earthwire branding. Tagline: "Stream live data from the planet into your music." A single "Try it" button.

2. **"Try it" unlocks audio** — the click satisfies the browser's AudioContext user-gesture requirement. Loads a preset patch: earthquake magnitude → demo synth filter cutoff, earthquake triggers → drum hits.

3. **Immediate sound** — the demo synth plays. Data moves. Signal meters animate. No setup, no MIDI, no instructions.

4. **Explore prompt** — subtle UI nudge: "Swap the source," "Add a channel," "Connect your DAW." Channel strip controls are visible and tweakable.

5. **MIDI connection** — when the user selects a real MIDI device in the output dropdown, the demo synth fades out and real MIDI takes over. A tooltip explains IAC Driver setup if no virtual ports are detected.

---

## 8. Patch System

A **patch** is the shareable artifact — a JSON document describing a complete session:

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
      "normalizer": { "mode": "auto", "windowSeconds": 86400 },
      "smoother": { "amount": 0.3 },
      "quantizer": null,
      "threshold": null,
      "output": { "type": "midi-cc", "channel": 1, "cc": 74 }
    }
  ]
}
```

### Storage

- **Autosave** to localStorage on every change
- **Export** as `.json` file for sharing
- **Import** from `.json` file
- **Bundled examples** ship with the app (e.g., "Seismic Filter Sweep," "Bird Rhythm Generator," "ISS Orbit Pad")
- `specVersion` field in every patch for forward-compatible migration

### No accounts, no cloud

Everything is client-side. No login, no database. API routes only proxy external APIs for CORS/rate-limit/key-storage reasons.

---

## 9. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | SvelteKit | Lightweight, reactive stores for signal state, static deploy |
| Language | TypeScript | Type safety for source/engine interfaces |
| MIDI | Web MIDI API (native) | No library needed |
| Audio (demo synth) | Web Audio API | Built into browser |
| ISS orbit computation | satellite.js | Client-side SGP4 propagation from CelesTrak TLEs |
| Visualization | HTML5 Canvas 2D | 60fps signal meters |
| API proxies | SvelteKit server routes (deployed as Vercel serverless functions) | CORS bypass, API key storage, caching |
| OSC bridge | Deno script | Single file, no install, cross-platform |
| Package manager | pnpm | Fast, efficient disk usage |
| Testing | Vitest | Native ESM, fast, good SvelteKit integration |
| CI | GitHub Actions | Free, runs tests |
| Deployment | Vercel (static + edge) | Generous free tier, first-class SvelteKit support |

### Browser support

Chromium only (Chrome, Edge, Arc, Brave) due to Web MIDI API requirement. Firefox and Safari do not support Web MIDI. This is documented clearly on the landing page. The demo synth works everywhere, but MIDI output requires Chromium.

---

## 10. Repo Structure

```
earthwire/
├── src/
│   ├── lib/
│   │   ├── sources/                 # Source adapters
│   │   │   ├── usgs.ts              # Earthquakes
│   │   │   ├── iss.ts               # ISS position (CelesTrak TLE + SGP4)
│   │   │   ├── ebird.ts             # Bird activity
│   │   │   ├── types.ts             # EarthwireSource interface
│   │   │   └── registry.ts          # Singleton source registry
│   │   ├── engine/                  # Core engine
│   │   │   ├── engine.ts            # Channel evaluator
│   │   │   ├── clock.ts             # BPM clock (AudioContext)
│   │   │   └── types.ts             # Signal types
│   │   ├── nodes/                   # Processing nodes
│   │   │   ├── normalizer.ts
│   │   │   ├── smoother.ts
│   │   │   ├── quantizer.ts
│   │   │   └── threshold.ts
│   │   ├── outputs/                 # Output targets
│   │   │   ├── midi.ts              # Web MIDI output
│   │   │   ├── osc.ts               # OSC WebSocket output
│   │   │   └── demo-synth.ts        # Built-in demo synth
│   │   └── stores/                  # Svelte stores
│   │       ├── patch.ts             # Patch state, save/load
│   │       ├── midi.ts              # MIDI access, port list
│   │       └── clock.ts             # BPM state
│   ├── routes/
│   │   ├── +page.svelte             # Single page app
│   │   └── api/                     # SvelteKit server routes (API proxies)
│   │       ├── usgs/+server.ts      # USGS proxy
│   │       ├── iss/+server.ts       # CelesTrak proxy
│   │       └── ebird/+server.ts     # eBird proxy (holds API key)
│   └── app.html
├── tools/
│   └── osc-bridge/
│       └── bridge.ts                # Deno OSC bridge
├── patches/
│   └── examples/                    # Bundled example patches
│       ├── seismic-filter-sweep.json
│       ├── bird-rhythm-generator.json
│       └── iss-orbit-pad.json
├── static/                          # Static assets (icons, etc.)
├── docs/
│   ├── getting-started.md
│   └── iac-driver-setup.md
├── package.json
├── svelte.config.js
├── LICENSE                          # MIT
└── CONTRIBUTING.md
```

---

## 11. Phased Roadmap

### Phase 0 — Foundation
- Repo scaffolding (pnpm, TypeScript, SvelteKit, Vercel)
- Core engine: channel evaluator, clock, signal types
- EarthwireSource interface + USGS earthquake adapter
- Normalizer, smoother nodes
- Web MIDI output (CC)
- Basic channel-strip UI (functional, not pretty)

### Phase 1 — Playable MVP
- Demo synth (Web Audio)
- Landing page + "Try it" flow
- ISS and eBird source adapters
- Quantizer and threshold nodes
- MIDI note and trigger output
- Signal meters (Canvas)
- Patch save/load (localStorage + JSON export)
- Bundled example patches
- Vercel deploy + API route proxies
- IAC Driver setup guide

### Phase 2 — More Sources + OSC
- Ocean hydrophone, wave/tide, lightning adapters
- OSC bridge tool
- Solar wind adapter
- Visual polish (source icons, animations)
- Vercel API route proxies for new sources

### Phase 3 — Future (out of scope for this spec)
- VCV Rack native plugin
- Bioacoustic sample browser
- OP-1 drum kit export
- OP-1 SysEx patch generation
- Community patch registry
- Additional natural phenomenon sources

---

## 12. Open Questions

1. **eBird API key.** Resolved: proxy through SvelteKit server route with a shared key stored as a Vercel environment variable. Rate-limit the proxy endpoint (e.g., 1 req/sec per client IP) to stay within eBird's allowance.

2. **Chromium-only messaging.** Show browser check on landing page. Demo synth works everywhere; MIDI output requires Chromium. Clear but not alarming.

3. **Patch format versioning.** Include `specVersion` in every patch from day one. Write a migration runner when the format changes.

4. **Name availability.** Check npm, GitHub, and domain availability for "earthwire" before committing.
