# Phase 2: Sample Browser & OP-1-F Drum Kit Export

**Date:** 2026-04-26  
**Status:** Reviewed  
**Scope:** `/samples` route — standalone nature sample discovery tool with OP-1-F drum kit export

---

## Overview

Phase 2 adds a sample browser to Earthwire that lets users search for nature recordings (bird calls, ocean, forest, weather) from Xeno-canto and Freesound, load their own local audio files, assemble up to 24 samples into a drum kit, trim each sample visually, and export a single `.aif` file ready to drag onto an OP-1-F (or OP-1/OP-Z) connected via USB.

This feature is independent of the Phase 1 live data sequencer. It lives at `/samples` and is accessible from the top nav. The `/samples` route uses its own layout (`src/routes/samples/+layout.svelte`) with a simplified header — the Phase 1 transport controls (BPM, swing, MIDI) are not shown here.

---

## Architecture

### Page structure

```
/samples                    → SampleBrowserPage
  ├── SampleBrowser         → left panel (tabs + search results)
  │     ├── MySoundsTab     → local file library (IndexedDB)
  │     ├── FreesoundTab    → Freesound.org search
  │     ├── XenocantoTab    → Xeno-canto raw search
  │     └── BirdSoundsTab   → Xeno-canto curated by common species
  └── KitBuilder            → right panel (300px, TE drum utility style)
        ├── KitHeader       → name input + device mode toggle
        ├── SegmentBar      → multi-color duration budget bar (TE-style)
        ├── SlotList        → 24 SlotRows
        │     └── SlotRow   → slot number, dot, name, mini waveform, arrow, duration
        │           └── WaveformTrim  → expanded waveform + trim handle (dark theme)
        └── KitFooter       → slot count + export button
```

### State — two-layer persistence model

`AudioBuffer` is a non-serialisable Web Audio object and cannot be stored in localStorage. The kit store uses two layers:

**Layer 1 — `localStorage`** (serialisable metadata only):
```ts
interface SlotMeta {
  name: string;
  sourceType: 'local' | 'freesound' | 'xeno-canto';
  remoteSrc?: string;      // URL to re-fetch for remote sources
  localId?: string;        // IndexedDB key for local files
  trimStart: number;       // seconds
  trimEnd: number;         // seconds
  fullDuration: number;    // original full length in seconds
  color: string;           // slot's assigned palette color
}
interface KitMeta {
  deviceMode: 'op1' | 'op1field';
  name: string;
  slots: (SlotMeta | null)[];  // 24 entries
}
```

**Layer 2 — in-memory** (`src/lib/stores/kit.ts`):
Live `AudioBuffer` references rehydrated on page load — from IndexedDB for local files, re-fetched for remote URLs.

**My Sounds library** — stored in IndexedDB (`src/lib/stores/my-sounds.ts`) as ArrayBuffers. Persists local files across sessions.

**Search results** — ephemeral, component-local state only.

---

## Left Panel: Sample Browser

### Tab order
1. **📁 My Sounds** — user's local library
2. **🌿 Freesound** — Freesound.org API
3. **Xeno-canto** — full raw search
4. **🐦 Bird Sounds** — curated Xeno-canto by common species

### My Sounds tab
- Drag-and-drop zone at top (accepts mp3, wav, aiff, flac, ogg)
- Files decoded via `AudioContext.decodeAudioData()`, ArrayBuffer stored in IndexedDB
- Library list: filename, duration, ▶ playback (direct from IndexedDB), `+ Add` to kit
- Files persist between sessions; user can delete entries

### Freesound tab
- Search field + filters: duration (< 10s / < 30s / any), license (CC0 only toggle)
- Results via `/api/freesound` SvelteKit proxy — adds `token=FREESOUND_CLIENT_ID` query param (Freesound API v2 uses a simple token, not OAuth2, for read-only search)
- Each result shows: ▶ play button (uses Freesound CDN preview URL directly — CORS-permissive, no proxy needed), name, tags, duration, license badge, `+ Add`
- For kit assembly, the full HQ audio is fetched via the proxy at the time the sample is added
- Attribution (recordist name + Freesound URL) stored in SlotMeta; a `<kitname>-credits.txt` is downloaded alongside the `.aif` on export

### Xeno-canto tab
- Search field (species name, English or Latin)
- Filters: quality (A / B / C+), max duration, country
- Results via `/api/xeno-canto` SvelteKit proxy
- ▶ play button uses Xeno-canto audio URL directly for inline preview
- Each result: species name, recording details (country, recordist), quality badge, duration, `+ Add`

### Bird Sounds tab
- Browse by common species family (Warblers, Thrushes, Raptors, Shorebirds, etc.)
- Clicking a family shows species list → clicking species runs a quality-A Xeno-canto search
- Simpler entry point than raw search

### Result items (all tabs)
- ▶ play button — inline preview only (CDN/direct URL, not through proxy)
- Name / species
- Metadata line (source, quality, country / tags)
- Duration
- `+ Add` → adds to next empty kit slot

---

## Right Panel: Kit Builder

Styled after the Teenage Engineering drum utility — minimal, numbered list.

### Kit header
- "drum kit" label (left)
- Editable kit name input (right, italic, used as export filename)

### Device mode toggle

| Mode | Format | Max total duration | APPL version |
|---|---|---|---|
| OP-1 / OP-Z | mono, 44100 Hz, 16-bit | 12 seconds | `drum_version: 1` |
| OP-1 field | stereo, 44100 Hz, 24-bit | 20 seconds | `drum_version: 2` |

Switching mode re-validates total duration and warns if over the new limit. The `op1-metadata.ts` builder uses the correct `drum_version` per mode.

### Multi-color segment bar (TE-style)

Directly mimics the TE drum utility's top progress bar:

- Each filled slot gets a **unique earthy color** assigned by slot index (terra cotta, navy, cream, tan, slate, burnt orange, green, plum…)
- Block **width = slot's trimmed duration ÷ device total budget**
- Remaining empty budget shown as **diagonal hatching** (`repeating-linear-gradient(-45deg, ...)`)
- Label row below: `3.6s used` (left) · `20s total` (right)
- Turns amber when >80% used, red when over budget
- Updates live as samples are added, removed, or trimmed

### Slot list (24 rows)

Each slot row (left-to-right, matching TE layout):

| Element | Detail |
|---|---|
| Slot number | Right-aligned, muted, `1`–`24` |
| Colored dot | Matches the slot's segment bar color; empty slots show hollow dot |
| Sample name | Filename with extension, truncated with ellipsis |
| Mini waveform | 70×22px SVG path generated from AudioBuffer peak data on add |
| Playmode arrow | `→` (OneShot) |
| Duration | `SS.CS` format — seconds and centiseconds (e.g. `01.40` = 1.40s, `00.68` = 0.68s) |

**Active slot** (selected): flips to **black background / white text** exactly like TE. Mini waveform stroke inverts to white. The expanded waveform trim section uses a dark theme.

**Empty slots**: italic `(empty)` label in muted color, no waveform or duration.

**Keyboard navigation** (matching TE conventions):
- Arrow keys → navigate slots
- Space → preview selected slot
- Backspace → remove sample from selected slot

### Per-slot waveform trim (inline expand, dark theme)

Clicking a filled slot expands it below the row:

```
┌─────────────────────────────────────────┐
│ 1  ● nightingale song.mp3    →  01.40   │  ← active (black bg)
├─────────────────────────────────────────┤  dark expand
│  [████████████▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░]  │  waveform canvas
│  00.00          ← 01.40 trim    03.20   │
│  trim to [01.40]  of 03.20   ▶ preview  │
└─────────────────────────────────────────┘
```

- **Waveform canvas** — drawn from AudioBuffer peak data. Region past trim point shown darker.
- **Trim end handle** — draggable green marker. Drag left to shorten.
- **Start offset handle** — secondary handle to skip silent intros.
- **Text input** — precise entry in `SS.CS` format.
- **Preview button** — plays only the trimmed portion.
- Budget bar updates live while dragging.

One slot expanded at a time; clicking another collapses the current one.

### Kit footer
- `3 / 24 slots` count (left)
- `export kit →` button (right) — disabled with tooltip when over budget
- Hint text: `arrow keys navigate · space previews · backspace deletes`

---

## Audio Pipeline (client-side)

All audio processing runs in the browser. No server-side audio computation.

```
1. Fetch audio (for kit assembly)
   └─ Remote sources: SvelteKit proxy (/api/xeno-canto, /api/freesound)
      handles CORS + credential hiding, returns raw audio bytes
   └─ Local files: read from IndexedDB ArrayBuffer

2. Decode
   └─ AudioContext.decodeAudioData()
      supports mp3, ogg, wav, flac, aiff natively in Chrome/Firefox

3. Store in memory
   └─ Decoded AudioBuffer held in in-memory kit store
      SlotMeta (serialisable) persisted to localStorage separately

4. Trim (on export)
   └─ OfflineAudioContext renders [trimStart, trimEnd] range exactly
      Resampled to 44100 Hz; downmixed to mono for OP-1/OP-Z mode

5. Stitch
   └─ All filled slot buffers concatenated into one Float32Array
      Empty slots contribute no audio (start === end in APPL metadata)

6. AIFF encode (Web Worker — keeps UI responsive)
   └─ Pure JS AIFF writer (src/lib/kit/aiff-encoder.ts)
      Chunk order (strict — OP-1 firmware requires this exact sequence):
        FORM > COMM > APPL > SSND
      APPL chunk contains OP-1 metadata JSON (padded to even byte length):
        {
          "drum_version": 1 | 2,        // 1 = OP-1/OP-Z, 2 = OP-1 field
          "type": "drum",
          "name": "<kit name>",
          "start":    [s0…s23],          // frame offset of each sample
          "end":      [e0…e23],          // frame offset of end of each sample
          "pitch":    [0, 0, …],         // 24 zeros
          "volume":   [8192, …],         // 24 × 8192 (unity gain)
          "pan":      [0, …],            // 24 zeros (centre)
          "playmode": ["OneShot", …]     // 24 × OneShot
        }

7. Download
   └─ URL.createObjectURL(new Blob([buffer], { type: 'audio/x-aiff' }))
      Primary file: <kitname>.aif
      If Freesound samples used: <kitname>-credits.txt (Freesound attribution)
```

### API proxy routes

| Route | Backend | Auth |
|---|---|---|
| `src/routes/api/xeno-canto/+server.ts` | `https://xeno-canto.org/api/2/recordings` | Optional Bearer token via `XENO_CANTO_KEY` env var (currently keyless, but key support built in for when they enforce it) |
| `src/routes/api/freesound/+server.ts` | `https://freesound.org/apiv2/search/text/` + HQ download | `token=FREESOUND_CLIENT_ID` query param (not OAuth2) |

---

## Files to Create / Modify

### New files
| Path | Purpose |
|---|---|
| `src/routes/samples/+layout.svelte` | Samples layout (simplified header, no transport controls) |
| `src/routes/samples/+page.svelte` | Main samples page |
| `src/lib/components/SampleBrowser.svelte` | Left panel with tabs |
| `src/lib/components/KitBuilder.svelte` | Right panel |
| `src/lib/components/SlotRow.svelte` | Single kit slot with waveform mini + expand |
| `src/lib/components/WaveformTrim.svelte` | Dark-theme waveform canvas + trim handle |
| `src/lib/components/SegmentBar.svelte` | Multi-color proportional duration bar |
| `src/lib/stores/kit.ts` | Kit state store (two-layer: localStorage meta + in-memory AudioBuffers) |
| `src/lib/stores/my-sounds.ts` | IndexedDB wrapper for local files |
| `src/lib/kit/aiff-encoder.ts` | Pure JS AIFF binary encoder (COMM > APPL > SSND order) |
| `src/lib/kit/op1-metadata.ts` | OP-1 APPL JSON builder (drum_version aware) |
| `src/lib/kit/audio-processor.ts` | Decode, trim (OfflineAudioContext), stitch helpers |
| `src/routes/api/xeno-canto/+server.ts` | Xeno-canto API proxy |
| `src/routes/api/freesound/+server.ts` | Freesound search + HQ download proxy |

### Modified files
| Path | Change |
|---|---|
| `src/lib/components/TopBar.svelte` | Add "Samples" link (routes to `/samples`) |
| `.env.example` | Add `FREESOUND_CLIENT_ID`, `XENO_CANTO_KEY` (optional) |

---

## Verification

1. **My Sounds** — drag a WAV onto the tab, confirm it appears and persists after reload (IndexedDB)
2. **Xeno-canto search** — search "nightingale", confirm results load; ▶ plays inline from CDN URL
3. **Freesound search** — search "ocean waves", confirm results with license badges; ▶ plays inline
4. **Kit assembly** — add 3 samples, confirm slots fill with colored dot, mini waveform, `SS.CS` duration
5. **Segment bar** — confirm each slot has a distinct color block proportional to its duration; empty space hatched
6. **Trim UI** — click a slot, confirm dark waveform canvas renders, drag handle updates duration + segment bar live
7. **Device mode** — toggle OP-1 field → OP-1/OP-Z, confirm budget changes 20s → 12s, mono/stereo label updates
8. **Export** — click export kit, confirm `.aif` downloads; inspect binary: chunks must appear in order `FORM`, `COMM`, `APPL`, `SSND`
9. **Freesound attribution** — if Freesound samples in kit, confirm `<kitname>-credits.txt` also downloads
10. **Budget enforcement** — samples totalling >20s in OP-1 field mode: export button disabled with tooltip
11. **Persistence** — add local files, reload, confirm My Sounds library intact; kit slot metadata restored
12. **Kit store re-hydration** — reload with remote samples in kit, confirm AudioBuffers re-fetched and waveforms re-render
