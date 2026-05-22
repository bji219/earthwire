<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let width: number | 'auto' = 120;
  export let height = 32;

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let buffer: number[] = [];
  const BUFFER_SIZE = 256;
  let animFrame: number;
  let resizeObserver: ResizeObserver | null = null;
  let canvasWidth = typeof width === 'number' ? width : 120;

  onMount(() => {
    ctx = canvas.getContext('2d');
    if (width === 'auto') {
      const sync = () => {
        const w = Math.max(1, Math.floor(wrap.clientWidth));
        if (w !== canvasWidth) {
          canvasWidth = w;
          canvas.width = w;
        }
      };
      sync();
      resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(wrap);
    }
    draw();
  });

  onDestroy(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  export function pushValue(value: number): void {
    buffer.push(Math.max(0, Math.min(1, value)));
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  }

  function draw(): void {
    if (!ctx) return;
    const w = canvasWidth;

    ctx.fillStyle = '#F5F2ED';
    ctx.fillRect(0, 0, w, height);

    if (buffer.length < 2) {
      animFrame = requestAnimationFrame(draw);
      return;
    }

    ctx.strokeStyle = '#1A6B5A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = w / (BUFFER_SIZE - 1);
    const startIdx = Math.max(0, buffer.length - BUFFER_SIZE);

    for (let i = startIdx; i < buffer.length; i++) {
      const x = (i - startIdx) * step;
      const y = height - buffer[i] * height;
      if (i === startIdx) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    const current = buffer[buffer.length - 1];
    ctx.fillStyle = '#1A6B5A';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(w - 4, height - current * height, 4, current * height);
    ctx.globalAlpha = 1;

    animFrame = requestAnimationFrame(draw);
  }
</script>

<div class="meter-wrap" bind:this={wrap} style="height:{height}px">
  <canvas
    bind:this={canvas}
    width={canvasWidth}
    {height}
    class="signal-meter"
    style={width === 'auto' ? 'width:100%' : `width:${width}px`}
  ></canvas>
</div>

<style>
  .meter-wrap {
    width: 100%;
    display: block;
  }
  .signal-meter {
    display: block;
    border-radius: 6px;
    border: 1px solid var(--border, #DDD8CF);
    height: 100%;
  }
</style>
