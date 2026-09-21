<!-- src/lib/components/KitBuilder.svelte -->
<script lang="ts">
  import { kit } from '$lib/stores/kit';
  import { audioPlayer } from '$lib/stores/audio-player';
  import SegmentBar from './SegmentBar.svelte';
  import SlotRow from './SlotRow.svelte';
  import {
    DEVICE_LIMITS, DEVICE_CHANNELS, SLOT_COLORS, PLAY_MODE_DEFAULT,
    PLAY_MODE_CYCLE, PLAY_MODE_ICON, PLAY_MODE_LABEL,
    type DeviceMode, type SlotMeta,
  } from '$lib/kit/types';
  import { buildOp1Metadata } from '$lib/kit/op1-metadata';
  import { trimBuffer, stitchBuffers, normalizeBuffer, normalizeFactor, peakInRange, appendSilence } from '$lib/kit/audio-processor';
  import { encodeAiff } from '$lib/kit/aiff-encoder';
  import { importOp1Kit } from '$lib/kit/op1-import';
  import { SUPPORT_URL } from '$lib/support';
  import { selectedSoundCount } from '$lib/stores/my-sounds';
  import { pitchRate, pitchedDuration, resampleBuffer, PITCH_DEFAULT } from '$lib/kit/pitch';
  import { applyGain, dbToLinear, GAIN_DEFAULT_DB } from '$lib/kit/gain';

  const deviceModes: [DeviceMode, string, string][] = [
    ['op1', 'OP–1 / OP–Z', 'mono · 12s'],
    ['op1field', 'OP–1 field', 'stereo · 20s'],
  ];

  let activeSlot = 0;
  let selectedSlots = new Set<number>();
  let lastClickedSlot: number | null = null;
  let exporting = false;
  let exportError = '';
  let exportProgress = 0; // 0–1
  let importing = false;
  let importError = '';
  let importNotice = '';
  let importInput: HTMLInputElement;

  function openImport() {
    importError = '';
    importNotice = '';
    importInput?.click();
  }

  async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const anyFilled = $kit.slots.some(Boolean);
    if (anyFilled && !confirm('Replace current kit with the imported one?')) return;

    importing = true;
    importError = '';
    importNotice = '';
    try {
      const summary = await importOp1Kit(file);
      importNotice = `imported ${summary.kitName || 'kit'}: ${summary.filledCount}/24 slots`;
      setTimeout(() => { importNotice = ''; }, 4000);
    } catch (err: any) {
      importError = err?.message ?? 'Import failed';
    } finally {
      importing = false;
    }
  }

  $: maxSeconds = DEVICE_LIMITS[$kit.deviceMode];
  $: usedSeconds = $kit.slots.reduce(
    (s, sl) => s + (sl ? pitchedDuration(sl) : 0), 0
  );
  $: overBudget = usedSeconds > maxSeconds;

  let editAll = false;
  $: filledCount = $kit.slots.filter(Boolean).length;
  // Auto-collapse when nothing's left to edit, so the panel can't outlive the kit.
  $: if (filledCount === 0 && editAll) editAll = false;

  $: exportTitle = overBudget
    ? `Over ${maxSeconds}s — last sample(s) will be clipped to fit`
    : '';

  // Shown only once a kit has actually been exported, so the ask lands after
  // someone has got what they came for rather than before.
  let hasExported = false;

  function handleKitNameChange(e: Event) {
    kit.setName((e.target as HTMLInputElement).value);
  }

  function handleSlotSelect(i: number) {
    if (lastClickedSlot !== null) {
      const [lo, hi] = lastClickedSlot < i ? [lastClickedSlot, i] : [i, lastClickedSlot];
      for (let n = lo; n <= hi; n++) selectedSlots.add(n);
      selectedSlots = selectedSlots;
    } else {
      selectedSlots = new Set([i]);
      lastClickedSlot = i;
    }
  }

  function clearSelected() {
    for (const n of selectedSlots) kit.clearSlot(n);
    selectedSlots = new Set();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeSlot = Math.min(23, activeSlot + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); activeSlot = Math.max(0,  activeSlot - 1); }
    if (e.key === ' ')         { e.preventDefault(); previewSlot(activeSlot); }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // The My Sounds tab binds the same key on window. When it has a selection
      // the press belongs to it, or deleting sounds would silently clear a slot.
      if ($selectedSoundCount > 0) return;
      e.preventDefault();
      if (selectedSlots.size > 0) { clearSelected(); } else { kit.clearSlot(activeSlot); }
    }
  }

  function handleFill(e: CustomEvent<{ index: number; name: string; sourceType: SlotMeta['sourceType']; remoteSrc?: string; buffer: AudioBuffer }>) {
    const { index, name, sourceType, remoteSrc, buffer } = e.detail;
    kit.setSlot(index, {
      name,
      sourceType,
      remoteSrc,
      trimStart: 0,
      trimEnd: buffer.duration,
      fullDuration: buffer.duration,
      color: SLOT_COLORS[index],
      playMode: PLAY_MODE_DEFAULT,
      pitchSemitones: PITCH_DEFAULT,
      gainDb: GAIN_DEFAULT_DB,
    }, buffer);
  }

  function handleReorder(e: CustomEvent<{ fromIndex: number; toIndex: number }>) {
    kit.swapSlots(e.detail.fromIndex, e.detail.toIndex);
  }

  function previewSlot(index: number) {
    const buf = kit.getBuffer(index);
    const slot = $kit.slots[index];
    if (!buf || !slot) return;
    audioPlayer.play(
      `slot-${index}`,
      async () => buf,
      slot.trimStart,
      slot.trimEnd,
      slot.playMode === 'revoneshot' || slot.playMode === 'revgate',
      pitchRate(slot.pitchSemitones ?? 0),
      // Export normalizes quiet slots before applying gain, so preview has to
      // model the same lift or judging gain by ear would be misleading.
      normalizeFactor(peakInRange(buf, slot.trimStart, slot.trimEnd))
        * dbToLinear(slot.gainDb ?? GAIN_DEFAULT_DB),
    );
  }

  async function doExport() {
    exporting = true;
    exportError = '';
    exportProgress = 0;
    try {
      const mode = $kit.deviceMode;
      const numChannels = DEVICE_CHANNELS[mode];
      const sampleRate  = 44100;

      // Reserve 1 frame per empty slot so each can claim a unique 1-frame
      // silence region without pushing the scaled positions past OP1_MAX.
      const emptyCount = $kit.slots.filter(s => !s).length;
      let remaining = maxSeconds - emptyCount / sampleRate;
      // The budget is spent in output seconds, but trim ends are source
      // seconds, so pitch converts between them. At rate 1 this is the
      // original arithmetic unchanged.
      const effectiveTrimEnds = $kit.slots.map(slot => {
        if (!slot) return null;
        const rate = pitchRate(slot.pitchSemitones ?? PITCH_DEFAULT);
        const outputDur = (slot.trimEnd - slot.trimStart) / rate;
        if (remaining <= 0) return slot.trimStart; // zero-length
        const allowedOutput = Math.min(outputDur, remaining);
        remaining -= allowedOutput;
        return slot.trimStart + allowedOutput * rate;
      });

      // Trim each slot's buffer sequentially so we can track progress.
      // Yield to the browser between each slot (setTimeout 0) so the progress
      // bar actually repaints — trimBuffer is synchronous/CPU-bound.
      const filledCount = $kit.slots.filter(Boolean).length;
      let done = 0;
      const trimmedBuffers: (AudioBuffer | null)[] = [];
      for (let i = 0; i < $kit.slots.length; i++) {
        const slot = $kit.slots[i];
        if (!slot) { trimmedBuffers.push(null); continue; }
        const buf = kit.getBuffer(i);
        if (!buf) { trimmedBuffers.push(null); continue; }
        const effectiveEnd = effectiveTrimEnds[i] ?? slot.trimEnd;
        if (effectiveEnd <= slot.trimStart) { trimmedBuffers.push(null); continue; }
        const trimmed = trimBuffer(buf, slot.trimStart, effectiveEnd, numChannels, sampleRate);
        // Pitch is baked into the audio rather than written to the OP-1 APPL
        // `pitch` array, so the device needs no interpretation. Same resampler
        // the preview uses, so the export matches what was auditioned.
        const rate = pitchRate(slot.pitchSemitones ?? PITCH_DEFAULT);
        const pitched = rate === 1 ? trimmed : await resampleBuffer(trimmed, rate);
        normalizeBuffer(pitched);
        // Strictly after normalize: it lifts anything under 0.5 peak up to 0.9,
        // so gaining first would let it boost a deliberate cut straight back.
        applyGain(pitched, slot.gainDb ?? GAIN_DEFAULT_DB);
        trimmedBuffers.push(pitched);
        exportProgress = ++done / filledCount * 0.8;
        await new Promise(r => setTimeout(r, 0)); // yield to browser for repaint
      }

      // Robust budget clamp: Math.round() accumulation can push total 1 frame
      // over budget, causing the last empty slot's APPL end position to exceed
      // OP1_MAX and the OP-1 Field firmware to reject the metadata block.
      // Cap the last filled buffer so totalFilledFrames + emptyCount ≤ maxTotalFrames.
      const maxTotalFrames = Math.floor(maxSeconds * sampleRate);
      const budgetFrames   = maxTotalFrames - emptyCount;
      let totalFilledFrames = trimmedBuffers.reduce((s, b) => s + (b ? b.length : 0), 0);
      if (totalFilledFrames > budgetFrames) {
        const excess = totalFilledFrames - budgetFrames;
        for (let i = trimmedBuffers.length - 1; i >= 0; i--) {
          const buf = trimmedBuffers[i];
          if (!buf) continue;
          const newLen = buf.length - excess;
          if (newLen <= 0) {
            trimmedBuffers[i] = null;
          } else {
            const clamped = new AudioBuffer({ numberOfChannels: numChannels, length: newLen, sampleRate });
            for (let ch = 0; ch < numChannels; ch++) {
              clamped.getChannelData(ch).set(buf.getChannelData(ch).subarray(0, newLen));
            }
            trimmedBuffers[i] = clamped;
          }
          break;
        }
      }

      const exportName = $kit.name.trim() || 'new kit';

      // Build APPL metadata from actual buffer lengths (not float duration estimates).
      // This ensures positions exactly match the stitched audio after clamping.
      const slotTimings = trimmedBuffers.map((buf, i) => {
        if (!buf) return null;
        return { trimDuration: buf.length / sampleRate, playMode: $kit.slots[i]?.playMode };
      });
      const applJson = buildOp1Metadata({
        kitName: exportName,
        deviceMode: mode,
        slots: slotTimings,
        sampleRate,
      });

      // Yield before the stitch+encode phase so the progress bar repaints
      exportProgress = 0.85;
      await new Promise(r => setTimeout(r, 0));

      // Stitch all trimmed buffers, then append 1 frame of silence per empty
      // slot so every slot in the APPL metadata can have a unique start<end.
      const stitched = appendSilence(
        stitchBuffers(trimmedBuffers, numChannels),
        emptyCount,
        numChannels
      );

      // Encode as AIFF
      const aiffBytes = encodeAiff({
        sampleRate,
        numChannels,
        samples: stitched,
        applJson,
      });

      exportProgress = 1;

      // Trigger download — copy into a plain ArrayBuffer to satisfy Blob's type constraint
      const aiffCopy: ArrayBuffer = aiffBytes.slice(0).buffer as ArrayBuffer;
      const blob = new Blob([aiffCopy], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${exportName.replace(/[^a-z0-9_-]/gi, '_')}.aif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      hasExported = true;
      // Revoke after a delay — Safari downloads blobs asynchronously and gets a 404
      // if the object URL is revoked before the download manager has read all the bytes.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Freesound attribution sidecar
      const freesoundSlots = $kit.slots.filter(s => s?.sourceType === 'freesound');
      if (freesoundSlots.length > 0) {
        const lines = freesoundSlots.map(s =>
          `${s!.name} — ${s!.remoteSrc ?? 'freesound.org'}`
        );
        const txt = [
          `Credits for "${exportName}" drum kit`,
          '',
          'Freesound samples (attribution required):',
          ...lines,
          '',
          'Generated by Earthwire',
        ].join('\n');
        const tblob = new Blob([txt], { type: 'text/plain' });
        const turl = URL.createObjectURL(tblob);
        const ta = document.createElement('a');
        ta.href = turl;
        ta.download = `${exportName.replace(/[^a-z0-9_-]/gi, '_')}-credits.txt`;
        document.body.appendChild(ta);
        await new Promise(r => setTimeout(r, 100));
        ta.click();
        document.body.removeChild(ta);
        setTimeout(() => URL.revokeObjectURL(turl), 60_000);
      }
    } catch (err: any) {
      exportError = err?.message ?? 'Export failed';
    } finally {
      exporting = false;
      exportProgress = 0;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="kit-builder">
  <!-- Header -->
  <div class="kit-header">
    <label class="kit-label" for="kit-name-input">drum kit</label>
    <div class="kit-name-field">
      <span class="kit-name-icon" aria-hidden="true">✎</span>
      <input
        id="kit-name-input"
        class="kit-name"
        value={$kit.name}
        on:change={handleKitNameChange}
        placeholder="name your kit…"
      />
    </div>
  </div>

  <!-- Device mode toggle -->
  <div class="device-tabs">
    {#each deviceModes as [mode, label, sub]}
      <button
        class="device-tab"
        class:active={$kit.deviceMode === mode}
        on:click={() => kit.setDeviceMode(mode)}
      >
        {label}<span class="device-sub">{sub}</span>
      </button>
    {/each}
  </div>

  <!-- Segment bar -->
  <SegmentBar slots={$kit.slots} deviceMode={$kit.deviceMode} on:preview={e => previewSlot(e.detail.index)} />

  {#if filledCount > 0}
    <div class="edit-all-bar" class:open={editAll}>
      <button
        class="edit-all-toggle"
        class:on={editAll}
        aria-pressed={editAll}
        on:click={() => editAll = !editAll}
      >
        <span class="edit-all-check">{editAll ? '☑' : '☐'}</span>
        edit all
        <span class="edit-all-count">({filledCount} slot{filledCount === 1 ? '' : 's'})</span>
      </button>
    </div>

    {#if editAll}
      <div class="bulk-edit-panel">
        <div class="bulk-edit-row">
          <span class="bulk-edit-label">play mode</span>
          <div class="mode-picker">
            {#each PLAY_MODE_CYCLE as mode}
              <button
                class="mode-pick"
                on:click={() => kit.setAllPlayMode(mode)}
                title="Set every filled slot to {PLAY_MODE_LABEL[mode]}"
                aria-label="Set play mode to {PLAY_MODE_LABEL[mode]}"
              >{PLAY_MODE_ICON[mode]}</button>
            {/each}
          </div>
        </div>

        <div class="bulk-edit-row">
          <span class="bulk-edit-label">tune</span>
          <span class="bulk-sub">pitch</span>
          <span class="tune-stepper">
            <button class="tune-step" on:click={() => kit.adjustAllPitch(-1)} aria-label="Nudge all slots pitch down a semitone">−</button>
            <span class="tune-val">±</span>
            <button class="tune-step" on:click={() => kit.adjustAllPitch(1)} aria-label="Nudge all slots pitch up a semitone">+</button>
          </span>
          <span class="tune-unit">semitones</span>

          <span class="bulk-sub bulk-sub-2">gain</span>
          <span class="tune-stepper">
            <button class="tune-step" on:click={() => kit.adjustAllGain(-1)} aria-label="Nudge all slots gain down one decibel">−</button>
            <span class="tune-val">±</span>
            <button class="tune-step" on:click={() => kit.adjustAllGain(1)} aria-label="Nudge all slots gain up one decibel">+</button>
          </span>
          <span class="tune-unit">dB</span>

          <button
            class="tune-reset"
            on:click={() => kit.resetAllTune()}
            title="Zero pitch and gain on every filled slot"
          >reset</button>
        </div>
      </div>
    {/if}
  {/if}

  <!-- 24 slot rows -->
  {#if selectedSlots.size > 1}
    <div class="bulk-bar">
      <span>{selectedSlots.size} slots selected</span>
      <button class="bulk-clear-btn" on:click={clearSelected}>Clear selected</button>
      <button class="bulk-deselect-btn" on:click={() => { selectedSlots = new Set(); }}>Deselect</button>
    </div>
  {/if}
  <div class="slot-list">
    {#each $kit.slots as slot, i}
      <SlotRow
        index={i}
        {slot}
        buffer={$kit.slots[i] ? kit.getBuffer(i) : undefined}
        isActive={activeSlot === i}
        isSelected={selectedSlots.has(i)}
        on:select={() => handleSlotSelect(i)}
        on:activate={() => { activeSlot = i; selectedSlots = new Set(); lastClickedSlot = i; previewSlot(i); }}
        on:clear={() => kit.clearSlot(i)}
        on:trim={e => kit.updateSlotTrim(i, e.detail.trimStart, e.detail.trimEnd)}
        on:cyclemode={() => kit.cyclePlayMode(i)}
        on:pitch={e => kit.adjustSlotPitch(i, e.detail.delta)}
        on:gain={e => kit.adjustSlotGain(i, e.detail.delta)}
        on:resettune={() => { kit.setSlotPitch(i, PITCH_DEFAULT); kit.setSlotGain(i, GAIN_DEFAULT_DB); }}
        on:preview={() => previewSlot(i)}
        on:fill={handleFill}
        on:reorder={handleReorder}
      />
    {/each}
  </div>

  <!-- Footer -->
  <div class="kit-footer">
    <span class="slot-count">
      {filledCount} / 24 slots
    </span>
    <button
      class="import-btn"
      disabled={importing || exporting}
      on:click={openImport}
      title="Import an existing OP-1 / OP-1 Field .aif drum kit"
    >
      {importing ? 'importing…' : '← import .aif'}
    </button>
    <button
      class="export-btn"
      disabled={exporting}
      title={exportTitle}
      on:click={doExport}
    >
      {exporting ? 'exporting…' : 'export kit →'}
    </button>
  </div>

  {#if hasExported && SUPPORT_URL}
    <a
      class="coffee-note"
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="coffee-icon" aria-hidden="true">☕</span>
      <span>enjoying Earthwire? <strong>buy me a coffee →</strong></span>
    </a>
  {/if}
  <input
    type="file"
    accept=".aif,.aiff"
    bind:this={importInput}
    on:change={handleImportFile}
    style="display:none"
  />

  {#if exporting}
    <div class="export-progress">
      <div class="export-progress-bar" style="width:{exportProgress * 100}%"></div>
    </div>
  {/if}

  {#if exportError}
    <p class="export-error">{exportError}</p>
  {/if}

  {#if importError}
    <p class="export-error">{importError}</p>
  {/if}

  {#if importNotice}
    <p class="import-notice">{importNotice}</p>
  {/if}

  <p class="hint">click plays · tune sets pitch and gain · edit-all applies to every filled slot · arrow keys navigate · shift-click range-selects · backspace/delete clears · drag to reorder</p>
</div>

<style>
  .kit-builder {
    display: flex; flex-direction: column; height: 100%;
    font-family: var(--font-body);
  }

  .kit-header {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.55rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .kit-label {
    font-size: 0.78rem; font-weight: 600; flex-shrink: 0; cursor: pointer;
  }

  /* Reads as an editable field rather than a right-aligned caption, so it is
     obvious this is where the kit gets named. */
  .kit-name-field {
    display: flex; align-items: center; gap: 0.35rem; flex: 1; min-width: 0;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-primary);
    padding: 0.2rem 0.5rem;
    transition: border-color 120ms;
  }
  .kit-name-field:hover { border-color: var(--text-muted); }
  .kit-name-field:focus-within { border-color: var(--accent); }
  .kit-name-icon {
    font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; line-height: 1;
  }
  .kit-name-field:focus-within .kit-name-icon { color: var(--accent); }
  .kit-name {
    flex: 1; min-width: 0;
    font-size: 0.76rem; border: none; background: transparent;
    color: var(--text-primary); outline: none;
    font-family: var(--font-body);
  }
  .kit-name::placeholder { color: var(--text-muted); font-style: italic; }

  .device-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .device-tab {
    flex: 1; padding: 0.38rem 0; font-size: 0.69rem; color: var(--text-muted);
    background: none; border: none; border-bottom: 2px solid transparent;
    cursor: pointer; display: flex; flex-direction: column; align-items: center;
    font-family: var(--font-body);
  }
  .device-tab.active {
    color: var(--text-primary); font-weight: 600;
    border-bottom-color: var(--text-primary);
  }
  .device-sub { font-size: 0.58rem; color: var(--text-muted); margin-top: 0.1rem; }

  .slot-list { flex: 1; overflow-y: auto; }

  .kit-footer {
    display: flex; justify-content: space-between; align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 1rem; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .slot-count { font-size: 0.68rem; color: var(--text-muted); margin-right: auto; }
  .import-btn, .export-btn {
    font-size: 0.75rem; font-weight: 500; background: none; border: none;
    cursor: pointer; font-family: var(--font-body); color: var(--text-primary);
  }
  .import-btn { color: var(--text-secondary, var(--text-muted)); }
  .import-btn:disabled, .export-btn:disabled { color: var(--text-muted); cursor: not-allowed; }
  .import-btn:hover:not(:disabled), .export-btn:hover:not(:disabled) { opacity: 0.6; }

  .import-notice {
    font-size: 0.7rem; color: var(--accent, #4a7c59); padding: 0.3rem 1rem;
  }

  .export-progress {
    height: 2px; background: var(--border); flex-shrink: 0;
  }
  .export-progress-bar {
    height: 100%; background: var(--accent, #4a7c59);
    transition: width 0.15s ease;
  }

  .export-error {
    font-size: 0.7rem; color: #c0392b; padding: 0.3rem 1rem;
  }

  /* Reads as its own element rather than fine print, but stays calm enough to
     ignore. Only ever shown after an export has completed. */
  .coffee-note {
    display: flex; align-items: center; gap: 0.45rem;
    align-self: flex-end; flex-shrink: 0;
    margin: 0 1rem 0.55rem;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 0.72rem;
    font-family: var(--font-body);
    text-decoration: none;
    transition: background 150ms, color 150ms;
  }
  .coffee-note:hover { background: var(--accent); color: #fff; }
  .coffee-icon { font-size: 0.85rem; line-height: 1; }

  .bulk-bar {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.35rem 1rem; background: var(--accent-bg);
    border-bottom: 1px solid var(--accent); flex-shrink: 0;
    font-size: 0.68rem; color: var(--accent);
  }
  .bulk-bar span { flex: 1; }
  .bulk-clear-btn, .bulk-deselect-btn {
    font-size: 0.65rem; padding: 0.15rem 0.55rem;
    border-radius: 3px; cursor: pointer; font-family: var(--font-body);
    background: none;
  }
  .bulk-clear-btn { border: 1px solid var(--danger, #c45b4a); color: var(--danger, #c45b4a); }
  .bulk-clear-btn:hover { background: var(--danger, #c45b4a); color: #fff; }
  .bulk-deselect-btn { border: 1px solid var(--accent); color: var(--accent); }
  .bulk-deselect-btn:hover { background: var(--accent); color: #fff; }

  .hint {
    font-size: 0.6rem; color: var(--text-muted); padding: 0.4rem 1rem;
    border-top: 1px solid var(--border-light, #eee); flex-shrink: 0;
  }

  .edit-all-bar {
    display: flex; align-items: center;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid var(--border-light, #eee);
    flex-shrink: 0;
  }
  .edit-all-bar.open { border-bottom-color: var(--accent); background: var(--accent-bg); }
  .edit-all-toggle {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-family: var(--font-body); font-size: 0.68rem;
    color: var(--text-muted);
    background: none; border: 1px solid transparent; border-radius: 3px;
    padding: 0.2rem 0.45rem; cursor: pointer;
  }
  .edit-all-toggle:hover { color: var(--text-primary); border-color: var(--border, #DDD8CF); }
  .edit-all-toggle.on { color: var(--accent); font-weight: 600; border-color: var(--accent); }
  .edit-all-check { font-size: 0.8rem; line-height: 1; }
  .edit-all-count { color: var(--text-muted); font-weight: 400; }
  .edit-all-toggle.on .edit-all-count { color: var(--accent); }

  .bulk-edit-panel {
    display: flex; flex-direction: column; gap: 0.35rem;
    padding: 0.5rem 1rem 0.6rem 1rem;
    background: var(--accent-bg);
    border-bottom: 1px solid var(--accent);
    flex-shrink: 0;
    font-size: 0.62rem; color: var(--text-muted);
  }
  .bulk-edit-row {
    display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
  }
  .bulk-edit-label {
    font-weight: 600; color: var(--accent);
    text-transform: uppercase; letter-spacing: 0.04em;
    font-size: 0.58rem; min-width: 4.5rem;
  }
  .bulk-sub { font-weight: 600; color: var(--text-secondary, #6B6B6B); }
  .bulk-sub-2 { margin-left: 0.9rem; }
  .mode-picker { display: flex; align-items: center; gap: 0.15rem; }
  .mode-pick {
    font-size: 0.85rem; line-height: 1;
    width: 1.7rem; height: 1.5rem;
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--text-secondary, #6B6B6B);
    background: var(--bg-input, #fff);
    border: 1px solid var(--border, #DDD8CF); border-radius: 3px;
    cursor: pointer; font-family: var(--font-body); padding: 0;
  }
  .mode-pick:hover { color: var(--accent); border-color: var(--accent); }

  .tune-stepper {
    display: inline-flex; align-items: center; gap: 0.05rem;
    border: 1px solid var(--border, #DDD8CF); border-radius: 3px;
    background: var(--bg-input, #fff);
  }
  .tune-step {
    font-size: 0.7rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0.05rem 0.35rem; line-height: 1;
    font-family: var(--font-body);
  }
  .tune-step:hover { color: var(--text-primary); }
  .tune-val {
    font-family: var(--font-mono, monospace); font-size: 0.6rem;
    min-width: 1.4rem; text-align: center; color: var(--text-muted);
  }
  .tune-unit { font-size: 0.58rem; opacity: 0.8; }
  .tune-reset {
    margin-left: auto; font-size: 0.58rem; background: none;
    border: 1px solid var(--border, #DDD8CF); border-radius: 3px;
    color: var(--text-muted); cursor: pointer; padding: 0.15rem 0.5rem;
    font-family: var(--font-body);
  }
  .tune-reset:hover { color: var(--text-primary); border-color: var(--text-muted); }

  @media (max-width: 768px) {
    .kit-builder { height: auto; min-height: 100%; }
    .slot-list { overflow-y: visible; }
    .kit-header { padding: 0.65rem 0.85rem; }
    .kit-name { font-size: 0.9rem; }
    .kit-name-field { padding: 0.35rem 0.6rem; }
    .kit-label { font-size: 0.85rem; }
    .device-tab {
      padding: 0.65rem 0;
      font-size: 0.8rem;
      min-height: 44px;
    }
    .device-sub { font-size: 0.65rem; }
    .kit-footer {
      padding: 0.75rem 0.85rem;
    }
    .slot-count { font-size: 0.78rem; }
    .import-btn, .export-btn {
      font-size: 0.9rem;
      padding: 0.5rem 0.85rem;
      min-height: 40px;
    }
    .bulk-bar { font-size: 0.8rem; padding: 0.55rem 0.85rem; gap: 0.65rem; }
    .bulk-clear-btn,
    .bulk-deselect-btn {
      font-size: 0.8rem;
      padding: 0.35rem 0.7rem;
      min-height: 32px;
    }
    .edit-all-bar { padding: 0.4rem 0.85rem; }
    .edit-all-toggle {
      font-size: 0.8rem; padding: 0.45rem 0.6rem;
      min-height: 40px; border-color: var(--border, #DDD8CF);
    }
    .bulk-edit-panel { padding: 0.6rem 0.85rem; font-size: 0.75rem; }
    .bulk-edit-label { font-size: 0.7rem; min-width: 100%; }
    .mode-pick {
      width: 2.4rem; height: 2.4rem; font-size: 1.1rem;
      min-width: 40px; min-height: 40px;
    }
    .tune-step {
      font-size: 1rem; min-width: 32px; min-height: 36px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .tune-val { font-size: 0.8rem; min-width: 1.7rem; }
    .tune-reset { font-size: 0.75rem; padding: 0.35rem 0.6rem; min-height: 36px; }
    .hint { font-size: 0.7rem; padding: 0.55rem 0.85rem; }
  }
</style>
