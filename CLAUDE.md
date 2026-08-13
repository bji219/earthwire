# sci-beat / Earthwire — CLAUDE.md

> Developer context for AI assistants working on this codebase.

---

## What This Project Is

**Earthwire** is an open-source web app that builds drum kits for the Teenage Engineering OP-1 and OP-1 Field. Browse and search Freesound / Xeno-canto / your own local files, fill a 24-slot kit, trim each sample, and export a valid `.aif` the device reads directly.

It is a single-purpose tool. Everything lives on `/`.

`/samples` and `/sequencer` are 308 redirects to `/`.

### The sequencer is archived, not deleted

Earthwire used to also ship a live-data → MIDI/CV engine at `/sequencer` (seismic activity, ISS position, bird migration, ocean sensors, solar wind, routed through a normalizer → LFO → smoother → quantizer → threshold pipeline). It was cut so the project could focus on the drum tool.

That code is preserved and reachable:

```bash
git show v0-sequencer            # annotated tag at the final state
git checkout archive/sequencer   # full working branch
```

Both are pushed to origin. Do not resurrect any of it into `main` without a deliberate decision — `src/lib/engine/`, `nodes/`, `sources/`, `outputs/`, the sequencer stores (`patch`, `clock`, `midi`, `monitor`), the sequencer components (`ChannelStrip`, `SignalMeter`, `TopBar`, `DemoSynthControls`, `DataMonitor`) and the data-source API routes are all gone from `main` on purpose.

---

## Business Model

**Free. All of it.** There is no paywall, no account, and no server-side state.

Earthwire briefly sold HMAC-signed unlock keys as an instant-download PDF on Etsy, gating exports,
the trim editor and My Sounds uploads. That was removed before any key sold. The gating was
client-side and bypassable from devtools in seconds, which was always an accepted trade rather than
a solved problem, and a tip jar fits a niche tool better than a wall nobody respects.

The paywall is preserved and reachable:

```bash
git show v1-paywall            # annotated tag at the final state
git checkout archive/paywall   # full working branch
```

That branch holds the whole key system: `src/lib/license/` (Crockford base32 + HMAC key format),
`/api/license/verify`, the licence store, `UnlockDialog`, and the `gen-key` / `new-batch` scripts
that minted keys and rendered the buyer PDF with pdfkit. Do not resurrect any of it into `main`
without a deliberate decision.

### Support link

[src/lib/support.ts](src/lib/support.ts) exports a single `SUPPORT_URL`. **Every support link is
rendered behind a truthiness check on it**, so while it is empty the site shows nothing rather than
shipping a dead link. Filling it in lights up three places at once: the header chip, a line under the
kit panel after a successful export, and a paragraph in the docs.

The post-export line is deliberate placement. It appears only once `hasExported` is true, so the ask
lands after someone has got what they came for rather than before.


## Tech Stack

- **SvelteKit** (Svelte 4, NOT Svelte 5 — do not use `$props()`, `$state()`, `$derived()` runes)
- **TypeScript** strict mode, `.js` extensions on local imports
- **Vitest** for unit tests (`pnpm test`)
- **pnpm** as package manager
- **Vercel** for deployment (`@sveltejs/adapter-vercel`)
- No ORM, no database — all state is in-memory or browser localStorage/IndexedDB

Browser-native APIs only: Web Audio for decode/preview, IndexedDB for the local sample library.

---

## Repo Layout

```
src/
  routes/
    +page.svelte              # Kit Designer — the whole app
    +layout.svelte            # Site chrome, nav, support link
    samples/+page.ts          # 308 redirect to /
    sequencer/+page.ts        # 308 redirect to / (archived feature)
    docs/getting-started/     # In-app docs
    api/
      xeno-canto/+server.ts        # Xeno-canto v3 search proxy
      xeno-canto/audio/+server.ts  # Audio stream proxy (CORS bypass)
      freesound/+server.ts         # Freesound search proxy

  lib/
    kit/
      types.ts                # SlotMeta, KitMeta, DeviceMode, DEVICE_LIMITS, SLOT_COLORS
      audio-processor.ts      # extractPeaks, extractPeaksRange, trimBuffer, normalizeBuffer, stitchBuffers
      aiff-encoder.ts         # Encodes Float32Array → valid AIFF binary
      aiff-parser.ts          # Reads AIFF/AIFC chunks back out
      pitch.ts                # pitchRate, pitchedDuration, resampleBuffer (baked, not metadata)
      gain.ts                 # dbToLinear, applyGain (baked, not metadata)
      op1-metadata.ts         # Builds OP-1 APPL chunk JSON for drum kit slot timings
      op1-metadata-parse.ts   # Parses an APPL chunk back into slot timings
      op1-import.ts           # Imports an existing OP-1 kit into the editor


    stores/
      kit.ts                  # KitMeta + PCM snapshot map (24 slots; Float32Arrays, not AudioBuffers)
      audio-player.ts         # Preview player (plays slot audio with trim)
      my-sounds.ts            # IndexedDB-backed local file store
      drag.ts                 # Drag-and-drop state

    support.ts              # SUPPORT_URL, empty until the tip page exists

    util/logger.ts

    components/
      KitBuilder.svelte        # 24-slot kit panel + export button
      SlotRow.svelte           # One slot row (✂ trim, playmode, tune)
      SegmentBar.svelte        # Duration bar, colored per slot (click to preview)
      WaveformTrimA.svelte     # Canvas waveform trim editor (variant A — stable, imperative draw)
      WaveformTrimB.svelte     # SVG waveform trim editor (variant B — colored trim region)
      WaveformTrim.svelte      # Original trim component (kept for reference)

      SampleBrowser.svelte     # Tab container: My Sounds / Freesound / Bird Sounds
      MySoundsTab.svelte       # Local file upload (IndexedDB)
      FreesoundTab.svelte      # Freesound.org search (category chips + infinite scroll)
      XenocantoTab.svelte      # Xeno-canto bird recordings (family chips, type filter, infinite scroll)

      LandingHero.svelte       # Splash / entry screen (first visit only)
```

---

## OP-1 Drum Kit Export

1. Each of the 24 slots has `trimStart`/`trimEnd` (seconds into the source buffer)
2. On export, each slot's buffer is trimmed via `trimBuffer(buf, start, end, channels, sr)`
3. If total duration exceeds the device limit (12s OP-1 / 20s OP-1 Field), last slot(s) are clipped to fit — **export is never blocked**
4. All trimmed buffers are stitched end-to-end via `stitchBuffers()`
5. OP-1 APPL chunk JSON is built with slot timings via `buildOp1Metadata()`
6. Encoded to AIFF binary via `encodeAiff()` and downloaded as `.aif`
7. If any Freesound samples are included, a `-credits.txt` sidecar is also downloaded

Device modes:
- `op1`: mono, 16-bit, 12s max
- `op1field`: stereo, 16-bit, 20s max

**Both modes are 16-bit, deliberately — do not "upgrade" the Field to 24-bit.** DigiChain, the most
widely used OP-1/Field kit exporter, hardcodes `numBytesPerSample = 2` and `setInt16(26, 16)` in its
`encodeAif`, which takes no bit-depth argument at all, while its WAV path *does* accept one. The
omission is a decision, not an oversight. The Field's advertised "32-bit audio" describes its
internal signal chain, not the drum patch format. Writing 24-bit would be an unverifiable experiment
risking firmware rejection, with nothing to gain on percussive one-shots.

Format details that matter: AIFC `sowt` 16-bit, FVER chunk, 64-byte COMM, 4100-byte APPL (4096-byte JSON + newline), `0x7FFFFFFE` fixed-point positions, and all 24 slots must satisfy `start < end` (empty slots get 1-frame silence regions).

### Per-slot pitch — baked into the audio, NOT metadata

Each `SlotMeta` has `pitchSemitones` (−24…+24, default 0). On export the trimmed buffer is resampled
by `2^(semitones/12)` via `resampleBuffer()` in [src/lib/kit/pitch.ts](src/lib/kit/pitch.ts), and the
APPL `pitch` array stays `Array(24).fill(0)`.

**Do not "fix" that by writing into the metadata array.** The encoding could not be pinned down:
DigiChain's OP-1 → OP-XY converter reads `Math.round((value / 512) / 12)`, which is either 512 or
6144 units per semitone depending on whether OP-XY's `transpose` is semitones or octaves, and no
consulted source settles it. Guessing wrong is a factor-of-twelve error discoverable only on
hardware. Baking removes the question, works identically on OP-1/Field/OP-Z, and leaves the device's
own pitch knob free as a live layer. Reverse stays metadata because `REVERSE_CODES` *is* verified.

Resampling uses `OfflineAudioContext`, deliberately, because preview uses `playbackRate` on a live
source node — same engine, so what you audition is what exports. Hand-rolled interpolation would
alias on pitch-up and break that. `resampleBuffer` therefore cannot be unit-tested (jsdom has no Web
Audio); the Playwright pass parses the exported COMM chunk and asserts the frame count instead.

**Pitch consumes device budget.** `trimEnd - trimStart` is the *source* span; the exported length is
`pitchedDuration()`. Every duration site uses that helper — `KitBuilder.usedSeconds` and its export
clamp, `SegmentBar`, `SlotRow`. Pitching down lengthens a slot and can overflow the 12s/20s budget,
which the existing tail-clip handles. The clamp converts between output and source seconds via the
rate, reducing to the original arithmetic at rate 1.

### Per-slot gain — also baked

`SlotMeta.gainDb` (−24…+6, default 0). Applied by `applyGain()` in
[src/lib/kit/gain.ts](src/lib/kit/gain.ts); the APPL `volume` array stays `Array(24).fill(8192)` for
the same reason `pitch` stays zeroed.

**Order matters twice, and both are easy to get wrong:**

1. Export runs `trimBuffer -> resampleBuffer -> normalizeBuffer -> applyGain`. Gain must come *after*
   normalize: normalize lifts anything under 0.5 peak up to 0.9, so gaining first would let it boost
   a deliberate cut straight back.
2. Preview must model the lift too. `previewSlot` passes
   `normalizeFactor(peakInRange(...)) * dbToLinear(gainDb)` into `audioPlayer.play()`. Without it a
   quiet slot previews quiet, the user compensates with +6, and the export then normalizes *and*
   applies the boost. `normalizeFactor` and `peakInRange` were split out of `normalizeBuffer`
   precisely so preview can ask the question without mutating.

`applyGain` does not clamp; `convertSamples` in the encoder already clamps to ±1.0, so a boost
hard-clips rather than wrapping.

### Per-slot playback mode

Each `SlotMeta` has a `playMode` (default `'oneshot'`), one of six values. The kit store exposes `setSlotPlayMode(i, mode)` and `cyclePlayMode(i)`; the latter advances through `PLAY_MODE_CYCLE` and is wired to a toggle button on `SlotRow` (next to the ✂ trim icon, dispatches the `cyclemode` event). Icons and labels are exported from `src/lib/kit/types.ts` as `PLAY_MODE_ICON` and `PLAY_MODE_LABEL`.

At export time, `op1-metadata.ts` translates the string mode to two orthogonal OP-1 APPL integer arrays. Codes confirmed via the operator1/op1 wiki, schollz/teoperator, padenot/libop1, and joseph-holland/op-patchstudio:

| Mode         | Icon | `playmode` | `reverse` |
|--------------|:----:|-----------:|----------:|
| `oneshot`    | ⇥    | 8192       | 12000     |
| `gate`       | ▶    | 4096       | 12000     |
| `loop`       | ∞    | 28672      | 12000     |
| `gravity`    | G    | 20480      | 12000     |
| `revoneshot` | ⇤    | 12288      | 18432     |
| `revgate`    | ◀    | 4096       | 18432     |

The `reverse=12000` "forward" value is preserved from this codebase's working baseline (matched against the verified-working `808.aif` Field kit) rather than switching to the research-canonical `8192`, to avoid regressing already-working exports.

The docs page at `/docs/getting-started` renders this list by iterating `PLAY_MODE_CYCLE` and looking up `PLAY_MODE_ICON` / `PLAY_MODE_LABEL`, with descriptions in a local `PLAY_MODE_BLURB` map. Adding a mode to `types.ts` therefore surfaces in the docs automatically, but **the blurb map is `Record<SlotPlayMode, string>`, so TypeScript will fail the build until you write its description.** That is deliberate.

In the kit editor, previewing a slot whose `playMode` is `revoneshot` or `revgate` plays the trimmed region back-to-front. `audioPlayer.play()` takes an optional `reverse` flag; when true it builds a frame-reversed `AudioBuffer` (using `new AudioBuffer({...})` per the kit-store rule, never `ctx.createBuffer`) and plays the whole buffer from position 0. Loop, gate and gravity previews are intentionally not implemented in the kit editor; they are export-only behaviors on the OP-1 itself.

---

## Environment Variables

Set in `.env` (see `.env.example`):

```
FREESOUND_CLIENT_ID=   # Required for the Freesound tab
# XENO_CANTO_KEY=      # Optional — keyless currently works
```

There are no secrets left. `LICENSE_SECRET`, `SITE_URL` and `ETSY_SHOP_URL` existed only for the
key PDF and went with the paywall; `LICENSE_SECRET` should also be deleted from the Vercel project.

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

## Coding Conventions

- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- **No trailing summaries** in responses — user can read the diff
- **Svelte 4 only** — no `$state()`, `$props()`, `$derived()` runes
- **`.js` extensions** on all local TS imports (SvelteKit ESM requirement)
- Prefer editing existing files over creating new ones
- TypeScript must compile clean (`npx tsc --noEmit`) before committing

---

## Testing

```bash
pnpm test                                   # All tests
pnpm test src/lib/kit/pitch.test.ts         # One file
```

Test count as of last update: 81 tests, all passing (7 test files).

- `src/lib/kit/aiff-encoder.test.ts` — AIFF encoding
- `src/lib/kit/op1-metadata.test.ts` — OP-1 metadata
- `src/lib/kit/op1-import.test.ts` — importing an existing kit
- `src/lib/kit/audio-processor.test.ts` — trim/stitch/peak utilities

`resampleBuffer` and the export path cannot be unit-tested (jsdom has no Web Audio). A Playwright pass covers them instead, parsing the exported COMM chunk to assert frame counts and peak ratios.

---

## Silent Export — Do Not Regress This

`pcmCache` snapshots raw `Float32Array`s at decode time. `kit.ts` stores `{ sr, nch, ch: Float32Array[] }` and reconstructs `new AudioBuffer` on every `getBuffer()` call.

**Never use `ctx.createBuffer()`** (audio thread pool) for stored samples — always `new AudioBuffer({...})` (JS heap). Buffers from the thread pool get reclaimed and export silently produces silence.

Related cross-browser download fixes, also load-bearing: `application/octet-stream` MIME, anchor appended to body before `.click()`, `URL.revokeObjectURL` deferred 60s (Safari 404s otherwise), and Brave Shields zeroing detected via `'brave' in navigator`.

---

## Waveform Trim — Implementation Note

The canvas waveform (WaveformTrimA) has a subtle stability constraint: if Svelte's reactive system touches any canvas attribute (`width`, `height`) after mount, the browser clears the canvas. The fix:

- `let viewEnd = 0` at declaration (not `= fullDuration`) — prevents any reactive computation before mount
- Canvas dimensions set **only** in `onMount`
- All drawing is imperative (`redraw()` called from `onMount` and zoom buttons only)
- `startPct`/`endPct` are still reactive — they only affect CSS positions, never the canvas

Peak normalization ensures bars always fill the full height regardless of the absolute amplitude in the zoomed window (`peaks = raw.map(p => p / Math.max(...raw, 0.0001))`).

---

## Known Pending / Future Work

- Kit presets — save and reload a kit layout without re-adding every sample
- A curated starter-kit bundle
