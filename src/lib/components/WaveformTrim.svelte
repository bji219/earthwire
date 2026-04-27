<!-- src/lib/components/WaveformTrim.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { extractPeaks } from '$lib/kit/audio-processor';
  import { formatDuration } from '$lib/kit/types';

  export let buffer: AudioBuffer;
  export let trimStart: number;   // seconds
  export let trimEnd: number;     // seconds
  export let fullDuration: number;

  const dispatch = createEventDispatcher<{
    change: { trimStart: number; trimEnd: number };
    preview: void;
  }>();

  let canvas: HTMLCanvasElement;
  const NUM_BARS = 120;
  let peaks: number[] = [];

  $: if (buffer) peaks = extractPeaks(buffer, NUM_BARS);

  $: if (peaks.length && canvas) drawWaveform();

  onMount(() => { drawWaveform(); });

  function drawWaveform() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const mid = height / 2;

    ctx.clearRect(0, 0, width, height);

    const trimStartPx = (trimStart / fullDuration) * width;
    const trimEndPx   = (trimEnd   / fullDuration) * width;

    peaks.forEach((peak, i) => {
      const x = (i / (NUM_BARS - 1)) * width;
      const h = peak * mid * 0.9;
      const inTrim = x >= trimStartPx && x <= trimEndPx;
      ctx.fillStyle = inTrim ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, mid - h, 1.5, h * 2);
    });
  }

  let dragging: 'start' | 'end' | null = null;

  function pxToSeconds(px: number): number {
    if (!canvas) return 0;
    return (px / canvas.clientWidth) * fullDuration;
  }

  function onPointerDown(e: PointerEvent, handle: 'start' | 'end') {
    dragging = handle;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const secs = Math.max(0, Math.min(fullDuration, pxToSeconds(px)));

    if (dragging === 'end') {
      const newEnd = Math.max(trimStart + 0.05, secs);
      dispatch('change', { trimStart, trimEnd: newEnd });
    } else {
      const newStart = Math.min(trimEnd - 0.05, secs);
      dispatch('change', { trimStart: newStart, trimEnd });
    }
  }

  function onPointerUp() { dragging = null; }

  function handleTextInput(e: Event, field: 'start' | 'end') {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(val)) return;
    if (field === 'end') {
      dispatch('change', {
        trimStart,
        trimEnd: Math.min(fullDuration, Math.max(trimStart + 0.05, val)),
      });
    } else {
      dispatch('change', {
        trimStart: Math.max(0, Math.min(trimEnd - 0.05, val)),
        trimEnd,
      });
    }
  }

  $: startPct = (trimStart / fullDuration) * 100;
  $: endPct   = (trimEnd   / fullDuration) * 100;
</script>

<svelte:window on:pointermove={onPointerMove} on:pointerup={onPointerUp} />

<div class="waveform-expand">
  <div class="canvas-wrap">
    <canvas
      bind:this={canvas}
      width={600}
      height={60}
      style="width:100%;height:48px;display:block"
    ></canvas>

    <!-- Shade outside trim region -->
    <div class="trim-shade trim-shade-left"  style="width:{startPct}%"></div>
    <div class="trim-shade trim-shade-right" style="width:{100 - endPct}%"></div>

    <!-- Trim handles -->
    <div
      class="handle handle-start"
      style="left:{startPct}%"
      on:pointerdown={e => onPointerDown(e, 'start')}
    ></div>
    <div
      class="handle handle-end"
      style="left:{endPct}%"
      on:pointerdown={e => onPointerDown(e, 'end')}
    ></div>
  </div>

  <div class="time-row">
    <span>{formatDuration(trimStart)}</span>
    <span>← trim region →</span>
    <span>{formatDuration(fullDuration)}</span>
  </div>

  <div class="controls-row">
    <span class="ctrl-label">start</span>
    <input
      class="ctrl-input"
      type="number"
      min="0"
      max={trimEnd - 0.05}
      step="0.05"
      value={trimStart.toFixed(2)}
      on:change={e => handleTextInput(e, 'start')}
    />
    <span class="ctrl-label">end</span>
    <input
      class="ctrl-input"
      type="number"
      min={trimStart + 0.05}
      max={fullDuration}
      step="0.05"
      value={trimEnd.toFixed(2)}
      on:change={e => handleTextInput(e, 'end')}
    />
    <span class="ctrl-label">of {formatDuration(fullDuration)}</span>
    <button class="preview-btn" on:click={() => dispatch('preview')}>▶ preview</button>
  </div>
</div>

<style>
  .waveform-expand { background: #111; padding: 0.5rem 0.75rem 0.65rem; }

  .canvas-wrap { position: relative; }

  .trim-shade {
    position: absolute; top: 0; height: 100%;
    background: rgba(0,0,0,0.5); pointer-events: none;
  }
  .trim-shade-left  { left: 0; }
  .trim-shade-right { right: 0; }

  .handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 10px; height: 22px;
    background: #4a7c59; border-radius: 2px;
    cursor: ew-resize; z-index: 2; touch-action: none;
  }

  .time-row {
    display: flex; justify-content: space-between;
    font-size: 0.6rem; color: #555; margin-top: 0.3rem;
    font-variant-numeric: tabular-nums;
  }

  .controls-row {
    display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem;
  }

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
