<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let width = 120;
  export let height = 32;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let buffer: number[] = [];
  const BUFFER_SIZE = 256;
  let animFrame: number;

  onMount(() => {
    ctx = canvas.getContext('2d');
    draw();
  });

  onDestroy(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
  });

  export function pushValue(value: number): void {
    buffer.push(Math.max(0, Math.min(1, value)));
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  }

  function draw(): void {
    if (!ctx) return;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (buffer.length < 2) {
      animFrame = requestAnimationFrame(draw);
      return;
    }

    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = width / (BUFFER_SIZE - 1);
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
    ctx.fillStyle = '#4ecdc4';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(width - 4, height - current * height, 4, current * height);
    ctx.globalAlpha = 1;

    animFrame = requestAnimationFrame(draw);
  }
</script>

<canvas bind:this={canvas} {width} {height} class="signal-meter"></canvas>

<style>
  .signal-meter {
    border-radius: 4px;
    border: 1px solid #333;
  }
</style>
