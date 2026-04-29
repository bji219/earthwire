<!-- src/lib/components/WaveformTrimB.svelte -->
<!-- Variant B: SVG waveform. Bars inside the trim region are accent-green,
     outside are faint. No canvas — SVG updates reactively without clearing.
     viewStart/viewEnd only change via zoom buttons, never during trim drag. -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { extractPeaksRange } from '$lib/kit/audio-processor';
  import { formatDuration } from '$lib/kit/types';

  export let buffer: AudioBuffer;
  export let trimStart: number;
  export let trimEnd: number;
  export let fullDuration: number;

  const dispatch = createEventDispatcher<{
    change: { trimStart: number; trimEnd: number };
    preview: void;
  }>();

  let wrapEl: HTMLDivElement;
  const NUM_BARS = 120;
  const SVG_W = 600;
  const SVG_H = 60;
  const SVG_MID = SVG_H / 2;

  let viewStart = 0;
  let viewEnd = 0; // set in onMount
  let peaks: number[] = [];

  onMount(() => {
    viewStart = 0;
    viewEnd = fullDuration;
    redraw(); // reads the values we just set above
  });

  // Handle positions (CSS only, do not affect SVG content)
  $: startPct = viewEnd > viewStart
    ? Math.max(0, Math.min(100, ((trimStart - viewStart) / (viewEnd - viewStart)) * 100))
    : 0;
  $: endPct = viewEnd > viewStart
    ? Math.max(0, Math.min(100, ((trimEnd - viewStart) / (viewEnd - viewStart)) * 100))
    : 100;

  // Bar coloring: which fraction of [0,1] within the view is inside the trim region
  $: startBarFrac = startPct / 100;
  $: endBarFrac   = endPct   / 100;

  let dragging: 'start' | 'end' | null = null;

  function pxToSeconds(px: number): number {
    if (!wrapEl) return 0;
    return viewStart + (px / wrapEl.clientWidth) * (viewEnd - viewStart);
  }

  function onPointerDown(e: PointerEvent, handle: 'start' | 'end') {
    dragging = handle;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const secs = Math.max(0, Math.min(fullDuration, pxToSeconds(px)));

    if (dragging === 'end') {
      dispatch('change', { trimStart, trimEnd: Math.max(trimStart + 0.05, secs) });
    } else {
      dispatch('change', { trimStart: Math.min(trimEnd - 0.05, secs), trimEnd });
    }
  }

  function onPointerUp() { dragging = null; }

  function redraw() {
    const raw = extractPeaksRange(buffer, NUM_BARS, viewStart, viewEnd);
    const max = Math.max(...raw, 0.0001);
    peaks = raw.map(p => p / max);
  }

  function fitToTrim() {
    const pad = Math.max(0.05, (trimEnd - trimStart) * 0.25);
    viewStart = Math.max(0, trimStart - pad);
    viewEnd   = Math.min(fullDuration, trimEnd + pad);
    redraw();
  }
  function showFull() {
    viewStart = 0;
    viewEnd = fullDuration;
    redraw();
  }
  function zoomIn() {
    const center = (viewStart + viewEnd) / 2;
    const half   = (viewEnd - viewStart) / 4;
    viewStart = Math.max(0, center - half);
    viewEnd   = Math.min(fullDuration, center + half);
    redraw();
  }
  function zoomOut() {
    const center = (viewStart + viewEnd) / 2;
    const half   = (viewEnd - viewStart);
    viewStart = Math.max(0, center - half);
    viewEnd   = Math.min(fullDuration, center + half);
    redraw();
  }

  function handleTextInput(e: Event, field: 'start' | 'end') {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(val)) return;
    if (field === 'end') {
      dispatch('change', { trimStart, trimEnd: Math.min(fullDuration, Math.max(trimStart + 0.05, val)) });
    } else {
      dispatch('change', { trimStart: Math.max(0, Math.min(trimEnd - 0.05, val)), trimEnd });
    }
  }
</script>

<svelte:window on:pointermove={onPointerMove} on:pointerup={onPointerUp} />

<div class="waveform-expand">
  <div class="svg-wrap" bind:this={wrapEl}>
    <svg
      viewBox="0 0 {SVG_W} {SVG_H}"
      preserveAspectRatio="none"
      style="width:100%;height:100%;display:block"
    >
      {#each peaks as peak, i}
        {@const frac = i / (NUM_BARS - 1)}
        {@const x = frac * SVG_W}
        {@const h = Math.max(1, peak * SVG_MID * 0.9)}
        {@const inside = frac >= startBarFrac && frac <= endBarFrac}
        <rect
          x={x}
          y={SVG_MID - h}
          width="2"
          height={h * 2}
          fill={inside ? '#4a7c59' : 'rgba(255,255,255,0.12)'}
        />
      {/each}
    </svg>

    <div class="handle" style="left:{startPct}%" on:pointerdown={e => onPointerDown(e, 'start')}></div>
    <div class="handle" style="left:{endPct}%"   on:pointerdown={e => onPointerDown(e, 'end')}></div>
  </div>

  <div class="time-row">
    <span>{formatDuration(viewStart)}</span>
    <div class="zoom-btns">
      <button on:click={fitToTrim}>Fit</button>
      <button on:click={zoomIn}>+</button>
      <button on:click={zoomOut}>−</button>
      <button on:click={showFull}>Full</button>
    </div>
    <span>{formatDuration(viewEnd)}</span>
  </div>

  <div class="controls-row">
    <span class="ctrl-label">start</span>
    <input class="ctrl-input" type="number" min="0" max={trimEnd - 0.05} step="0.05"
      value={trimStart.toFixed(2)} on:change={e => handleTextInput(e, 'start')} />
    <span class="ctrl-label">end</span>
    <input class="ctrl-input" type="number" min={trimStart + 0.05} max={fullDuration} step="0.05"
      value={trimEnd.toFixed(2)} on:change={e => handleTextInput(e, 'end')} />
    <span class="ctrl-label">of {formatDuration(fullDuration)}</span>
    <button class="preview-btn" on:click={() => dispatch('preview')}>▶ preview</button>
  </div>
</div>

<style>
  .waveform-expand { background: #111; padding: 0.5rem 0.75rem 0.65rem; }

  .svg-wrap { position: relative; height: 48px; }

  .handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 10px; height: 22px;
    background: #4a7c59; border-radius: 2px;
    cursor: ew-resize; z-index: 2; touch-action: none;
  }

  .time-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.6rem; color: #555; margin-top: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
  .zoom-btns { display: flex; gap: 0.25rem; align-items: center; }
  .zoom-btns button {
    font-size: 0.58rem; padding: 0.1rem 0.35rem;
    border: 1px solid #333; border-radius: 3px; color: #888;
    cursor: pointer; background: #1a1a1a; font-family: var(--font-body); line-height: 1.4;
  }
  .zoom-btns button:hover { border-color: #4a7c59; color: #4a7c59; }

  .controls-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
  .ctrl-label { font-size: 0.62rem; color: #777; }
  .ctrl-input {
    width: 3.5rem; background: #222; color: #fff;
    border: 1px solid #333; border-radius: 3px;
    padding: 0.15rem 0.3rem; font-size: 0.68rem;
    text-align: center; font-variant-numeric: tabular-nums;
  }
  .preview-btn {
    margin-left: auto; font-size: 0.62rem; padding: 0.18rem 0.5rem;
    border: 1px solid #333; border-radius: 3px; color: #aaa;
    cursor: pointer; background: #222;
  }
  .preview-btn:hover { border-color: #4a7c59; color: #4a7c59; }
</style>
