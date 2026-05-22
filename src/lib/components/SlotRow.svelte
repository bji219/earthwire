<!-- src/lib/components/SlotRow.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import WaveformTrimA from './WaveformTrimA.svelte';
  import WaveformTrimB from './WaveformTrimB.svelte';
  import { extractPeaks, peaksToSvgPath } from '$lib/kit/audio-processor';
  import { SLOT_COLORS, SLOT_NOTES, formatDuration } from '$lib/kit/types';
  import { dragPayload } from '$lib/stores/drag';
  import type { SlotMeta } from '$lib/kit/types';

  export let index: number;
  export let slot: SlotMeta | null;
  export let buffer: AudioBuffer | undefined;
  export let isActive: boolean = false;
  export let isSelected: boolean = false;

  const dispatch = createEventDispatcher<{
    activate: void;
    select: void;
    clear: void;
    trim: { trimStart: number; trimEnd: number };
    preview: void;
    fill: { index: number; name: string; sourceType: 'local' | 'freesound' | 'xeno-canto'; remoteSrc?: string; buffer: AudioBuffer };
    reorder: { fromIndex: number; toIndex: number };
  }>();

  const MINI_BARS = 32;
  const MINI_W = 70;
  const MINI_H = 22;

  $: peaks = buffer ? extractPeaks(buffer, MINI_BARS) : [];
  $: svgPath = peaksToSvgPath(peaks, MINI_W, MINI_H);
  $: color = SLOT_COLORS[index];
  $: note  = SLOT_NOTES[index];
  $: trimDuration = slot ? slot.trimEnd - slot.trimStart : 0;

  let isDragOver = false;
  let editing = false;
  let trimVariant: 'A' | 'B' = 'A';

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    const types = e.dataTransfer?.types ?? [];
    e.dataTransfer!.dropEffect = types.includes('application/earthwire-slot') ? 'move' : 'copy';
    isDragOver = true;
  }

  function handleDragLeave() { isDragOver = false; }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const types = e.dataTransfer?.types ?? [];
    if (types.includes('application/earthwire-slot')) {
      const fromIndex = parseInt(e.dataTransfer!.getData('application/earthwire-slot'), 10);
      if (fromIndex !== index) dispatch('reorder', { fromIndex, toIndex: index });
    } else if (types.includes('application/earthwire-sound')) {
      const payload = get(dragPayload);
      if (payload) dispatch('fill', { index, ...payload });
    }
  }

  function handleSlotDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/earthwire-slot', String(index));
  }
</script>

<div class="slot-wrap">
  <div
    class="slot-row"
    class:active={isActive}
    class:selected={isSelected}
    class:filled={!!slot}
    class:drag-over={isDragOver}
    draggable={!!slot}
    on:click={(e) => { if (e.shiftKey) { dispatch('select'); } else { dispatch('activate'); } }}
    on:dragstart={handleSlotDragStart}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <span class="slot-num">{index + 1}</span>

    <span class="slot-dot-wrap">
      {#if slot}
        <span class="dot" style="background:{color}"></span>
      {:else}
        <span class="dot dot-empty"></span>
      {/if}
    </span>

    <span class="slot-name" class:empty={!slot}>
      {slot ? slot.name : `(${note})`}
    </span>

    {#if slot && svgPath}
      <svg class="mini-wave" viewBox="0 0 {MINI_W} {MINI_H}" preserveAspectRatio="none">
        <path d={svgPath} fill={isActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'} stroke="none" />
      </svg>
    {:else}
      <span class="mini-wave"></span>
    {/if}

    {#if slot}
      <button
        class="trim-btn"
        class:open={editing}
        on:click|stopPropagation={() => (editing = !editing)}
        title="Open trim editor"
      >✂</button>
    {/if}

    <span class="slot-dur">
      {slot ? formatDuration(trimDuration) : ''}
    </span>

    {#if slot}
      <button
        class="clear-btn"
        on:click|stopPropagation={() => dispatch('clear')}
        title="Remove sample"
      >✕</button>
    {/if}
  </div>

  {#if editing && slot && buffer}
    <div class="variant-bar">
      <span class="variant-label">variant</span>
      <button class="var-btn" class:active={trimVariant === 'A'} on:click={() => trimVariant = 'A'}>A canvas</button>
      <button class="var-btn" class:active={trimVariant === 'B'} on:click={() => trimVariant = 'B'}>B svg</button>
    </div>
    {#if trimVariant === 'A'}
      <WaveformTrimA
        {buffer}
        trimStart={slot.trimStart}
        trimEnd={slot.trimEnd}
        fullDuration={slot.fullDuration}
        on:change={e => dispatch('trim', e.detail)}
        on:preview={() => dispatch('preview')}
      />
    {:else}
      <WaveformTrimB
        {buffer}
        trimStart={slot.trimStart}
        trimEnd={slot.trimEnd}
        fullDuration={slot.fullDuration}
        on:change={e => dispatch('trim', e.detail)}
        on:preview={() => dispatch('preview')}
      />
    {/if}
  {/if}
</div>

<style>
  .slot-wrap { border-bottom: 1px solid var(--border-light, #eee); }

  .variant-bar {
    display: flex; align-items: center; gap: 0.35rem;
    padding: 0.25rem 0.75rem; background: #0d0d0d; border-bottom: 1px solid #1e1e1e;
  }
  .variant-label { font-size: 0.58rem; color: #444; text-transform: uppercase; letter-spacing: 0.06em; }
  .var-btn {
    font-size: 0.6rem; padding: 0.1rem 0.45rem;
    border: 1px solid #2a2a2a; border-radius: 3px;
    background: #1a1a1a; color: #555; cursor: pointer; font-family: var(--font-body);
  }
  .var-btn.active { border-color: #4a7c59; color: #4a7c59; background: #0f1f15; }

  .slot-row {
    display: flex; align-items: center; gap: 0;
    min-height: 32px; cursor: pointer;
    transition: background 80ms;
  }
  .slot-row:hover:not(.active):not(.selected) { background: var(--bg-secondary); }
  .slot-row.selected:not(.active) { background: var(--accent-bg); outline: 1px solid var(--accent); outline-offset: -1px; }
  .slot-row.active { background: #1a1a1a; color: #fff; }
  .slot-row.drag-over {
    outline: 2px solid var(--accent, #4a9eff);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--accent, #4a9eff) 10%, transparent);
  }

  .slot-num {
    font-size: 0.68rem; color: var(--text-muted); width: 2.2rem;
    text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-num { color: #666; }

  .slot-dot-wrap {
    width: 1rem; flex-shrink: 0;
    display: flex; justify-content: center;
  }
  .dot { width: 5px; height: 5px; border-radius: 50%; display: block; }
  .dot-empty { border: 1px solid #ccc; background: transparent; }
  .slot-row.active .dot-empty { border-color: #444; }

  .slot-name {
    flex: 1; font-size: 0.73rem; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; padding: 0 0.5rem; color: var(--text-primary);
  }
  .slot-name.empty { color: var(--text-muted); font-style: italic; }
  .slot-row.active .slot-name { color: #fff; }

  .mini-wave { width: 70px; height: 22px; flex-shrink: 0; }

  .playmode-arrow {
    font-size: 0.72rem; color: var(--text-muted);
    width: 1.2rem; text-align: center; flex-shrink: 0;
  }
  .slot-row.active .playmode-arrow { color: #555; }

  .slot-dur {
    font-size: 0.68rem; color: var(--text-muted);
    width: 3rem; text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-dur { color: #aaa; }

  .clear-btn {
    font-size: 0.58rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.5rem; flex-shrink: 0;
    opacity: 0;
  }
  .slot-row:hover .clear-btn { opacity: 1; }
  .clear-btn:hover { color: #c0392b; }

  .trim-btn {
    font-size: 0.62rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.4rem; flex-shrink: 0;
    opacity: 0;
  }
  .slot-row:hover .trim-btn { opacity: 1; }
  .trim-btn.open { opacity: 1; color: var(--accent, #4a7c59); }
  .slot-row.active .trim-btn { color: #999; }
  .slot-row.active .trim-btn.open { color: #4a7c59; }

  @media (max-width: 768px) {
    .slot-row {
      min-height: 48px;
      gap: 0.25rem;
      padding: 0.25rem 0;
    }
    .slot-num {
      font-size: 0.8rem;
      width: 2rem;
      padding-right: 0.4rem;
    }
    .dot { width: 10px; height: 10px; }
    .slot-name {
      font-size: 0.9rem;
      padding: 0 0.4rem;
    }
    .mini-wave { display: none; }
    .slot-dur {
      font-size: 0.75rem;
      width: 2.6rem;
      padding-right: 0.35rem;
    }
    .clear-btn,
    .trim-btn {
      opacity: 1;
      font-size: 0.95rem;
      padding: 0.5rem 0.65rem;
      min-width: 36px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
