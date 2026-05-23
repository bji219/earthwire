<!-- src/lib/components/KitBuilder.svelte -->
<script lang="ts">
  import { kit } from '$lib/stores/kit';
  import { audioPlayer } from '$lib/stores/audio-player';
  import SegmentBar from './SegmentBar.svelte';
  import SlotRow from './SlotRow.svelte';
  import {
    DEVICE_LIMITS, DEVICE_CHANNELS, SLOT_COLORS,
    type DeviceMode, type SlotMeta,
  } from '$lib/kit/types';
  import { buildOp1Metadata } from '$lib/kit/op1-metadata';
  import { trimBuffer, stitchBuffers, normalizeBuffer, appendSilence } from '$lib/kit/audio-processor';
  import { encodeAiff } from '$lib/kit/aiff-encoder';

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

  $: maxSeconds = DEVICE_LIMITS[$kit.deviceMode];
  $: usedSeconds = $kit.slots.reduce(
    (s, sl) => s + (sl ? sl.trimEnd - sl.trimStart : 0), 0
  );
  $: overBudget = usedSeconds > maxSeconds;

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
    }, buffer);
  }

  function handleReorder(e: CustomEvent<{ fromIndex: number; toIndex: number }>) {
    kit.swapSlots(e.detail.fromIndex, e.detail.toIndex);
  }

  function previewSlot(index: number) {
    const buf = kit.getBuffer(index);
    const slot = $kit.slots[index];
    if (!buf || !slot) return;
    audioPlayer.play(`slot-${index}`, async () => buf, slot.trimStart, slot.trimEnd);
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
      const effectiveTrimEnds = $kit.slots.map(slot => {
        if (!slot) return null;
        const dur = slot.trimEnd - slot.trimStart;
        if (remaining <= 0) return slot.trimStart; // zero-length
        const allowed = Math.min(dur, remaining);
        remaining -= allowed;
        return slot.trimStart + allowed;
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
        normalizeBuffer(trimmed);
        trimmedBuffers.push(trimmed);
        exportProgress = ++done / filledCount * 0.8;
        await new Promise(r => setTimeout(r, 0)); // yield to browser for repaint
      }

      const exportName = $kit.name.trim() || 'new kit';

      // Build APPL metadata
      const slotTimings = $kit.slots.map((slot, i) => {
        if (!slot || !trimmedBuffers[i]) return null;
        const effectiveEnd = effectiveTrimEnds[i] ?? slot.trimEnd;
        return { trimDuration: effectiveEnd - slot.trimStart };
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
    <span class="kit-label">drum kit</span>
    <input
      class="kit-name"
      value={$kit.name}
      on:change={handleKitNameChange}
      placeholder="kit name…"
    />
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
        on:preview={() => previewSlot(i)}
        on:fill={handleFill}
        on:reorder={handleReorder}
      />
    {/each}
  </div>

  <!-- Footer -->
  <div class="kit-footer">
    <span class="slot-count">
      {$kit.slots.filter(Boolean).length} / 24 slots
    </span>
    <button
      class="export-btn"
      disabled={exporting}
      title={overBudget ? `Over ${maxSeconds}s — last sample(s) will be clipped to fit` : ''}
      on:click={doExport}
    >
      {exporting ? 'exporting…' : 'export kit →'}
    </button>
  </div>

  {#if exporting}
    <div class="export-progress">
      <div class="export-progress-bar" style="width:{exportProgress * 100}%"></div>
    </div>
  {/if}

  {#if exportError}
    <p class="export-error">{exportError}</p>
  {/if}

  <p class="hint">arrow keys navigate · click plays · shift-click range-selects · backspace/delete clears · drag to reorder</p>
</div>

<style>
  .kit-builder {
    display: flex; flex-direction: column; height: 100%;
    font-family: var(--font-body);
  }

  .kit-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.55rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .kit-label { font-size: 0.78rem; font-weight: 600; }
  .kit-name {
    font-size: 0.74rem; border: none; background: transparent;
    color: var(--text-muted); text-align: right; outline: none;
    font-style: italic; font-family: var(--font-body); width: 50%;
  }

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
    padding: 0.65rem 1rem; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .slot-count { font-size: 0.68rem; color: var(--text-muted); }
  .export-btn {
    font-size: 0.75rem; font-weight: 500; background: none; border: none;
    cursor: pointer; font-family: var(--font-body); color: var(--text-primary);
  }
  .export-btn:disabled { color: var(--text-muted); cursor: not-allowed; }
  .export-btn:hover:not(:disabled) { opacity: 0.6; }

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

  @media (max-width: 768px) {
    .kit-builder { height: auto; min-height: 100%; }
    .slot-list { overflow-y: visible; }
    .kit-header { padding: 0.65rem 0.85rem; }
    .kit-name { width: 60%; font-size: 0.85rem; }
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
    .export-btn {
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
    .hint { font-size: 0.7rem; padding: 0.55rem 0.85rem; }
  }
</style>
