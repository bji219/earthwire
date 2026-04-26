<script lang="ts">
  import { SLOT_COLORS, DEVICE_LIMITS, formatDuration } from '$lib/kit/types';
  import type { SlotMeta, DeviceMode } from '$lib/kit/types';

  export let slots: (SlotMeta | null)[];
  export let deviceMode: DeviceMode;

  $: maxSeconds = DEVICE_LIMITS[deviceMode];
  $: usedSeconds = slots.reduce((sum, s) => sum + (s ? s.trimEnd - s.trimStart : 0), 0);

  $: barClass = usedSeconds > maxSeconds ? 'over' : usedSeconds > maxSeconds * 0.8 ? 'warn' : '';
</script>

<div class="segment-wrap">
  <div class="segment-bar">
    {#each slots as slot, i}
      {#if slot}
        {@const pct = ((slot.trimEnd - slot.trimStart) / maxSeconds) * 100}
        <div
          class="segment"
          style="width:{pct}%;background:{SLOT_COLORS[i]}"
          title="Slot {i + 1}: {slot.name} ({formatDuration(slot.trimEnd - slot.trimStart)})"
        ></div>
      {/if}
    {/each}
    <div class="segment-empty"></div>
  </div>
  <div class="segment-labels">
    <span class="label-used {barClass}">{formatDuration(usedSeconds)} used</span>
    <span class="label-total">{maxSeconds}s total</span>
  </div>
</div>

<style>
  .segment-wrap { padding: 0.6rem 1rem 0; }

  .segment-bar {
    height: 28px;
    display: flex;
    border-radius: 3px;
    overflow: hidden;
  }

  .segment { height: 100%; flex-shrink: 0; }

  .segment-empty {
    flex: 1;
    background-image: repeating-linear-gradient(
      -45deg,
      transparent, transparent 3px,
      rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
    );
    background-color: var(--bg-secondary);
  }

  .segment-labels {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0 0.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.63rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .label-used.warn { color: #c08030; }
  .label-used.over { color: #c0392b; }
</style>
