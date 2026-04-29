<!-- src/lib/components/KitBuilder.svelte -->
<script lang="ts">
  import { kit } from '$lib/stores/kit';
  import { audioPlayer } from '$lib/stores/audio-player';
  import SegmentBar from './SegmentBar.svelte';
  import SlotRow from './SlotRow.svelte';
  import {
    DEVICE_LIMITS, DEVICE_CHANNELS, DEVICE_BIT_DEPTH, SLOT_COLORS,
    type DeviceMode, type SlotMeta,
  } from '$lib/kit/types';
  import { buildOp1Metadata } from '$lib/kit/op1-metadata';
  import { trimBuffer, stitchBuffers } from '$lib/kit/audio-processor';
  import { encodeAiff } from '$lib/kit/aiff-encoder';

  const deviceModes: [DeviceMode, string, string][] = [
    ['op1', 'OP–1 / OP–Z', 'mono · 12s'],
    ['op1field', 'OP–1 field', 'stereo · 20s'],
  ];

  let activeSlot = 0;
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeSlot = Math.min(23, activeSlot + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); activeSlot = Math.max(0,  activeSlot - 1); }
    if (e.key === ' ')         { e.preventDefault(); previewSlot(activeSlot); }
    if (e.key === 'Backspace') { e.preventDefault(); kit.clearSlot(activeSlot); }
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
      const bitDepth    = DEVICE_BIT_DEPTH[mode];
      const sampleRate  = 44100;

      // If total exceeds device limit, trim the last sample(s) to fit
      let remaining = maxSeconds;
      const effectiveTrimEnds = $kit.slots.map(slot => {
        if (!slot) return null;
        const dur = slot.trimEnd - slot.trimStart;
        if (remaining <= 0) return slot.trimStart; // zero-length
        const allowed = Math.min(dur, remaining);
        remaining -= allowed;
        return slot.trimStart + allowed;
      });

      // Trim each slot's buffer sequentially so we can track progress
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
        trimmedBuffers.push(await trimBuffer(buf, slot.trimStart, effectiveEnd, numChannels, sampleRate));
        exportProgress = ++done / filledCount * 0.8; // trim = 80% of progress
      }

      // Build APPL metadata
      const slotTimings = $kit.slots.map((slot, i) => {
        if (!slot || !trimmedBuffers[i]) return null;
        const effectiveEnd = effectiveTrimEnds[i] ?? slot.trimEnd;
        return { trimDuration: effectiveEnd - slot.trimStart };
      });
      const applJson = buildOp1Metadata({
        kitName: $kit.name,
        deviceMode: mode,
        slots: slotTimings,
        sampleRate,
      });

      // Stitch all trimmed buffers into one float array
      const stitched = stitchBuffers(trimmedBuffers, numChannels);

      // Encode as AIFF
      const aiffBytes = encodeAiff({
        sampleRate,
        numChannels,
        bitDepth,
        samples: stitched,
        applJson,
      });

      exportProgress = 1;

      // Trigger download — copy into a plain ArrayBuffer to satisfy Blob's type constraint
      const aiffCopy: ArrayBuffer = aiffBytes.slice(0).buffer as ArrayBuffer;
      const blob = new Blob([aiffCopy], { type: 'audio/x-aiff' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${$kit.name.replace(/[^a-z0-9_-]/gi, '_')}.aif`;
      a.click();
      URL.revokeObjectURL(url);

      // Freesound attribution sidecar
      const freesoundSlots = $kit.slots.filter(s => s?.sourceType === 'freesound');
      if (freesoundSlots.length > 0) {
        const lines = freesoundSlots.map(s =>
          `${s!.name} — ${s!.remoteSrc ?? 'freesound.org'}`
        );
        const txt = [
          `Credits for "${$kit.name}" drum kit`,
          '',
          'Freesound samples (attribution required):',
          ...lines,
          '',
          'Generated by Earthwire',
        ].join('\n');
        const tblob = new Blob([txt], { type: 'text/plain' });
        const ta = document.createElement('a');
        const turl = URL.createObjectURL(tblob);
        ta.href = turl;
        ta.download = `${$kit.name.replace(/[^a-z0-9_-]/gi, '_')}-credits.txt`;
        ta.click();
        URL.revokeObjectURL(turl);
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
  <div class="slot-list">
    {#each $kit.slots as slot, i}
      <SlotRow
        index={i}
        {slot}
        buffer={$kit.slots[i] ? kit.getBuffer(i) : undefined}
        isActive={activeSlot === i}
        on:activate={() => { activeSlot = i; previewSlot(i); }}
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

  <p class="hint">arrow keys navigate · click/space plays · backspace deletes · drag to reorder</p>
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

  .hint {
    font-size: 0.6rem; color: var(--text-muted); padding: 0.4rem 1rem;
    border-top: 1px solid var(--border-light, #eee); flex-shrink: 0;
  }
</style>
