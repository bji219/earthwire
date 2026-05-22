<!-- src/lib/components/WaveformTrimA.svelte -->
<!-- Variant A: Canvas waveform. Canvas dimensions + peaks are managed
     imperatively (onMount + zoom calls only). Svelte reactive system
     never touches the canvas, so nothing redraws during trim drag. -->
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

  let canvas: HTMLCanvasElement;
  let canvasWrap: HTMLDivElement;
  let resizeObserver: ResizeObserver | null = null;
  const NUM_BARS = 120;
  const CANVAS_HEIGHT = 60;

  // View window — only changed by zoom buttons
  let viewStart = 0;
  let viewEnd = 0; // set in onMount; 0 avoids reactive statement running before mount

  // startPct / endPct only affect CSS handle positions, never canvas content
  $: startPct = viewEnd > viewStart
    ? Math.max(0, Math.min(100, ((trimStart - viewStart) / (viewEnd - viewStart)) * 100))
    : 0;
  $: endPct = viewEnd > viewStart
    ? Math.max(0, Math.min(100, ((trimEnd - viewStart) / (viewEnd - viewStart)) * 100))
    : 100;

  function sizeCanvasToWrap() {
    if (!canvas || !canvasWrap) return;
    const w = Math.max(1, Math.floor(canvasWrap.clientWidth));
    if (canvas.width !== w) {
      canvas.width = w;
      canvas.height = CANVAS_HEIGHT;
      redraw();
    }
  }

  onMount(() => {
    canvas.height = CANVAS_HEIGHT;
    viewStart = 0;
    viewEnd = fullDuration;
    sizeCanvasToWrap();
    resizeObserver = new ResizeObserver(() => sizeCanvasToWrap());
    resizeObserver.observe(canvasWrap);
    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
  });

  // Call this any time the view window changes.
  // Peaks are normalized to the loudest bar in the window so bars always
  // fill the full height regardless of absolute amplitude in the region.
  function redraw() {
    const raw = extractPeaksRange(buffer, NUM_BARS, viewStart, viewEnd);
    const max = Math.max(...raw, 0.0001);
    drawWaveform(raw.map(p => p / max));
  }

  function drawWaveform(peaks: number[]) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const mid = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';

    peaks.forEach((peak, i) => {
      const x = (i / (NUM_BARS - 1)) * width;
      const h = peak * mid * 0.9;
      ctx.fillRect(x, mid - h, 1.5, h * 2);
    });
  }

  // Trim handle drag — only dispatches values, never redraws canvas
  let dragging: 'start' | 'end' | null = null;

  function pxToSeconds(px: number): number {
    if (!canvas) return 0;
    return viewStart + (px / canvas.clientWidth) * (viewEnd - viewStart);
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
      dispatch('change', { trimStart, trimEnd: Math.max(trimStart + 0.05, secs) });
    } else {
      dispatch('change', { trimStart: Math.min(trimEnd - 0.05, secs), trimEnd });
    }
  }

  function onPointerUp() { dragging = null; }

  // Zoom — each updates view window then redraws
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
  <div class="canvas-wrap" bind:this={canvasWrap}>
    <!-- No width/height attributes — canvas dimensions managed imperatively via ResizeObserver -->
    <canvas bind:this={canvas} style="width:100%;height:100%;display:block"></canvas>

    <div class="trim-shade trim-shade-left"  style="width:{startPct}%"></div>
    <div class="trim-shade trim-shade-right" style="width:{100 - endPct}%"></div>

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

  .canvas-wrap { position: relative; height: 48px; }

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

  @media (max-width: 768px) {
    .waveform-expand { padding: 0.6rem 0.65rem 0.75rem; }
    .canvas-wrap { height: 64px; }
    .handle { width: 14px; height: 30px; }
    .zoom-btns { gap: 0.4rem; }
    .zoom-btns button {
      font-size: 0.8rem;
      padding: 0.4rem 0.65rem;
      min-height: 36px;
      min-width: 36px;
    }
    .controls-row { flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .ctrl-label { font-size: 0.75rem; }
    .ctrl-input {
      width: 4.5rem;
      font-size: 0.85rem;
      padding: 0.4rem 0.5rem;
      min-height: 36px;
    }
    .preview-btn {
      font-size: 0.85rem;
      padding: 0.45rem 0.85rem;
      min-height: 36px;
    }
  }
</style>
