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

Earthwire is free to use with limits, and sells an unlock key ("Earthwire Pro") as an instant-download PDF on Etsy.

| | Free | Pro |
|---|---|---|
| Sample browsing (Freesound, Xeno-canto) | unlimited | unlimited |
| 24 slots, both device modes, all play modes | yes | yes |
| Kit exports | `FREE_EXPORT_LIMIT` (currently 1) | unlimited |
| Waveform trim editor | locked | unlocked |
| My Sounds uploads | `FREE_UPLOAD_LIMIT` (currently 10) | unlimited |

Every limit is a constant in [src/lib/license/limits.ts](src/lib/license/limits.ts). Tuning the free tier is a one-line change plus a redeploy — do it there, never inline at a call site.

### Why the gating is deliberately lightweight

This repo is public and kit export runs entirely in the browser. **No client-side gate here is unbypassable**, and none is meant to be. The audience is OP-1 owners, not attackers. The server exists for exactly one reason: it holds `LICENSE_SECRET`, so keys cannot be *forged* offline. Someone editing `localStorage` to fake an unlock is an accepted cost, not a bug to escalate against.

Do not add device fingerprinting, obfuscation, or server-side export in the name of "closing the hole." That trade was considered and rejected.

---

## License Keys

Key shape: `EW-B01-7KQ4M-9XTPZ-A3F8QW`

- `EW` prefix, then a **batch** (`B` + two chars), a 10-char random payload, and a 6-char HMAC-SHA256 signature over `batch:payload`
- Alphabet is Crockford base32 (no `I`, `L`, `O`, `U`); `normalizeKey` folds `O→0`, `I/L→1`, `U→V` and ignores dashes and case, because buyers retype these off a PDF
- Keys carry no expiry and no per-buyer identity — verification is pure signature checking, so there is **no database**

### The Etsy sales loop

Etsy delivers the same file to every buyer, so a key cannot be unique per order. Instead the **Etsy listing quantity is 5**, which caps how many people share one key and gives you a free rotation trigger — Etsy emails you when the listing sells out.

```bash
pnpm new-batch         # next batch id, mints the key, writes the PDF, records it
pnpm new-batch B07     # a specific batch id
pnpm gen-key B07       # a bare key, for replacements — no PDF, no ledger entry
```

Each sellout:

1. Etsy emails "sold out"
2. `pnpm new-batch`
3. Upload the generated `.keys/earthwire-pro-<batch>.pdf` to the listing, replacing the old file
4. Set quantity back to 5

**No deploy is involved.** The verify route accepts anything `LICENSE_SECRET` signs, for any batch, so a key works the instant it is minted. Keys from old batches keep working forever — retiring a batch just means you stop issuing it.

`.keys/` holds the ledger and the generated PDFs and is **gitignored on purpose** — this repo is public, and committing it would publish every key ever sold. `pnpm new-batch` picks the next id from the highest one in the ledger and refuses to reuse an existing id, since that would put two live keys under a single revocation unit.

`SITE_URL` from `.env` is printed into the PDF as the address buyers visit. Get it wrong and every customer follows a dead link.

### Revoking

Both lists live in [src/lib/license/sign.ts](src/lib/license/sign.ts) and both require a redeploy:

- `REVOKED_KEYS` — one leaked key. Everyone else in its batch keeps working. **Reach for this first.**
- `REVOKED_BATCHES` — the whole batch. All 5 buyers need replacement keys via `pnpm gen-key`.

Entries are normalized on comparison, so paste a key in whatever form you have it — dashes, lowercase, or neither.

### Script/library duplication

`scripts/lib/key.mjs` reimplements the base32 + HMAC logic because plain Node cannot import the `$lib` TypeScript. [gen-key.test.ts](src/lib/license/gen-key.test.ts) runs both real scripts and verifies their output against the library — if you change the key format, that test is what stops the two implementations from silently diverging and issuing dead keys. It runs against a temp directory via `EARTHWIRE_KEYS_DIR` so it never touches your real ledger.

### Deferred upgrade path

If unique-per-buyer keys or real activation caps become worth it:

- **Unique keys need a claim step.** The PDF is identical for everyone, so buyers would visit a `/claim` page and trade their Etsy order number for a key from a pool. Etsy's API can verify the receipt properly (`transactions_r` scope), but its refresh tokens expire after 90 days — let the refresh cron lapse and every claim breaks silently while the shop keeps selling.
- **Activation caps need a writable store.** Capping a key at N devices is a write per unlock; there is nowhere to count today. Upstash Redis via the Vercel Marketplace is the pick — free tier, and unlike Supabase it does not pause. Supabase was rejected because free projects pause after 7 days idle and every project in this account is currently paused.

---

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
    +layout.svelte            # Site chrome, nav, Pro chip, UnlockDialog mount
    samples/+page.ts          # 308 redirect to /
    sequencer/+page.ts        # 308 redirect to / (archived feature)
    docs/getting-started/     # In-app docs
    api/
      xeno-canto/+server.ts        # Xeno-canto v3 search proxy
      xeno-canto/audio/+server.ts  # Audio stream proxy (CORS bypass)
      freesound/+server.ts         # Freesound search proxy
      license/verify/+server.ts    # HMAC key verification (holds LICENSE_SECRET)

  lib/
    kit/
      types.ts                # SlotMeta, KitMeta, DeviceMode, DEVICE_LIMITS, SLOT_COLORS
      audio-processor.ts      # extractPeaks, extractPeaksRange, trimBuffer, normalizeBuffer, stitchBuffers
      aiff-encoder.ts         # Encodes Float32Array → valid AIFF binary
      aiff-parser.ts          # Reads AIFF/AIFC chunks back out
      op1-metadata.ts         # Builds OP-1 APPL chunk JSON for drum kit slot timings
      op1-metadata-parse.ts   # Parses an APPL chunk back into slot timings
      op1-import.ts           # Imports an existing OP-1 kit into the editor

    license/
      limits.ts               # FREE_EXPORT_LIMIT, FREE_UPLOAD_LIMIT, ETSY_LISTING_URL, storage keys
      key-format.ts           # Alphabet, normalizeKey, parseKey, formatKey, bytesToBase32
      sign.ts                 # signPayload, verifyKey, generateKey, REVOKED_BATCHES

    stores/
      kit.ts                  # KitMeta + PCM snapshot map (24 slots; Float32Arrays, not AudioBuffers)
      license.ts              # Unlock state, export counter, unlock-dialog state
      audio-player.ts         # Preview player (plays slot audio with trim)
      my-sounds.ts            # IndexedDB-backed local file store
      drag.ts                 # Drag-and-drop state

    util/logger.ts

    components/
      KitBuilder.svelte        # 24-slot kit panel + export button  [export gate]
      SlotRow.svelte           # One slot row (✂ trim toggle)       [trim gate]
      SegmentBar.svelte        # Duration bar, colored per slot (click to preview)
      WaveformTrimA.svelte     # Canvas waveform trim editor (variant A — stable, imperative draw)
      WaveformTrimB.svelte     # SVG waveform trim editor (variant B — colored trim region)
      WaveformTrim.svelte      # Original trim component (kept for reference)

      SampleBrowser.svelte     # Tab container: My Sounds / Freesound / Bird Sounds
      MySoundsTab.svelte       # Local file upload (IndexedDB)      [upload gate]
      FreesoundTab.svelte      # Freesound.org search (category chips + infinite scroll)
      XenocantoTab.svelte      # Xeno-canto bird recordings (family chips, type filter, infinite scroll)

      UnlockDialog.svelte      # Key entry modal, headline varies by which wall was hit
      LandingHero.svelte       # Splash / entry screen (first visit only)
```

---

## Where the Gates Live

Three call sites, all thin. The feature code behind each is untouched.

| Gate | File | Behavior |
|---|---|---|
| Export | `KitBuilder.doExport()` | Bails to `openUnlock('export')` when out of free exports. `recordExport()` fires right after the anchor click, so a later failure in the credits sidecar cannot refund a free export. |
| Trim | `SlotRow.toggleTrim()` | Shows 🔒 instead of ✂ and opens the dialog. A reactive guard also closes an open editor if Pro is deactivated mid-session. |
| Upload | `MySoundsTab.addFiles()` | Accepts files up to the cap and opens the dialog for the remainder — a 15-file drop still stores the first 10 rather than dropping the batch. |

`src/lib/stores/license.ts` is the only thing any of them talks to: `isUnlocked`, `exportsRemaining`, `uploadLimit`, `canExport()`, `recordExport()`, `activate()`, `deactivate()`, `openUnlock(reason)`.

`deactivate()` exists so you can test the free tier without clearing site data — call it from the devtools console.

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
- `op1field`: stereo, 24-bit, 20s max

Format details that matter: AIFC `sowt` 16-bit, FVER chunk, 64-byte COMM, 4100-byte APPL (4096-byte JSON + newline), `0x7FFFFFFE` fixed-point positions, and all 24 slots must satisfy `start < end` (empty slots get 1-frame silence regions).

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

## Environment Variables

Set in `.env` (see `.env.example`):

```
FREESOUND_CLIENT_ID=   # Required for the Freesound tab
LICENSE_SECRET=        # Required to sign/verify Pro keys
SITE_URL=              # Printed into the key PDF — buyers follow this
ETSY_SHOP_URL=         # Used in the PDF's "message me" line
# XENO_CANTO_KEY=      # Optional — keyless currently works
```

`LICENSE_SECRET` is server-only. **Never prefix it `PUBLIC_`** — SvelteKit would ship it to the browser and anyone could mint their own keys. It is read through `$env/dynamic/private` so it can be rotated in Vercel without a rebuild.

**The local and Vercel values must be identical.** Keys are signed locally by `pnpm new-batch` and verified in production by the deployed route; if the two secrets differ, a key that is already printed in a customer's PDF verifies as `invalid` and that buyer is locked out with no self-service fix. For the same reason, **never rotate `LICENSE_SECRET` after a sale** — it invalidates every key ever issued, including ones already sitting in customers' PDFs.

---

## Commands

```bash
pnpm dev          # Dev server (usually :5173 or :5174)
pnpm build        # Production build
pnpm check        # svelte-check + tsc
pnpm test         # Vitest (run all tests)
pnpm test <file>  # Run a specific test file
pnpm new-batch    # Mint the next batch: key + ready-to-upload PDF + ledger entry
pnpm gen-key B02  # Mint a bare Pro key for batch B02 (replacements)
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
pnpm test src/lib/license/sign.test.ts      # One file
```

Test count as of last update: 81 tests, all passing (7 test files).

- `src/lib/kit/aiff-encoder.test.ts` — AIFF encoding
- `src/lib/kit/op1-metadata.test.ts` — OP-1 metadata
- `src/lib/kit/op1-import.test.ts` — importing an existing kit
- `src/lib/kit/audio-processor.test.ts` — trim/stitch/peak utilities
- `src/lib/license/key-format.test.ts` — parsing, normalization, confusable folding
- `src/lib/license/sign.test.ts` — HMAC round-trip, tampering, revocation
- `src/lib/license/gen-key.test.ts` — the CLI generator agrees with the library

The gates themselves are covered by a Playwright pass rather than unit tests: free-tier walls, dialog copy, key entry, and the unlock transition. Re-run that against a dev server after touching any gate.

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
- A curated starter-kit bundle to ship alongside the Pro key on Etsy
- Revisit the free-tier limits once there is real conversion data (see `limits.ts`)
