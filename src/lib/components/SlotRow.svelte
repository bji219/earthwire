<!-- src/lib/components/SlotRow.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import WaveformTrim from './WaveformTrim.svelte';
  import { extractPeaks, peaksToSvgPath } from '$lib/kit/audio-processor';
  import { SLOT_COLORS, SLOT_NOTES, formatDuration } from '$lib/kit/types';
  import type { SlotMeta } from '$lib/kit/types';

  export let index: number;
  export let slot: SlotMeta | null;
  export let buffer: AudioBuffer | undefined;
  export let isActive: boolean = false;

  const dispatch = createEventDispatcher<{
    activate: void;
    clear: void;
    trim: { trimStart: number; trimEnd: number };
    preview: void;
  }>();

  const MINI_BARS = 32;
  const MINI_W = 70;
  const MINI_H = 22;

  $: peaks = buffer ? extractPeaks(buffer, MINI_BARS) : [];
  $: svgPath = peaksToSvgPath(peaks, MINI_W, MINI_H);
  $: color = SLOT_COLORS[index];
  $: note  = SLOT_NOTES[index];
  $: trimDuration = slot ? slot.trimEnd - slot.trimStart : 0;
</script>

<div class="slot-wrap">
  <div
    class="slot-row"
    class:active={isActive}
    class:filled={!!slot}
    on:click={() => dispatch('activate')}
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
        <path
          d={svgPath}
          fill="none"
          stroke={isActive ? '#fff' : '#1a1a1a'}
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    {:else}
      <span class="mini-wave"></span>
    {/if}

    <span class="playmode-arrow">{slot ? '→' : ''}</span>

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

  {#if isActive && slot && buffer}
    <WaveformTrim
      {buffer}
      trimStart={slot.trimStart}
      trimEnd={slot.trimEnd}
      fullDuration={slot.fullDuration}
      on:change={e => dispatch('trim', e.detail)}
      on:preview={() => dispatch('preview')}
    />
  {/if}
</div>

<style>
  .slot-wrap { border-bottom: 1px solid var(--border-light, #eee); }

  .slot-row {
    display: flex; align-items: center; gap: 0;
    min-height: 32px; cursor: pointer;
    transition: background 80ms;
  }
  .slot-row:hover:not(.active) { background: var(--bg-secondary); }
  .slot-row.active { background: #1a1a1a; color: #fff; }

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
</style>
