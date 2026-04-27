<!-- src/routes/samples/+page.svelte -->
<script lang="ts">
  import SampleBrowser from '$lib/components/SampleBrowser.svelte';
  import KitBuilder    from '$lib/components/KitBuilder.svelte';
  import { kit } from '$lib/stores/kit';
  import { SLOT_COLORS } from '$lib/kit/types';
  import type { SlotMeta } from '$lib/kit/types';

  function handleAdd(e: CustomEvent<{
    name: string;
    sourceType: SlotMeta['sourceType'];
    remoteSrc?: string;
    buffer: AudioBuffer;
  }>) {
    const { name, sourceType, remoteSrc, buffer } = e.detail;

    // Find next empty slot
    const index = $kit.slots.findIndex(s => s === null);
    if (index === -1) return; // kit full — all 24 slots used

    const meta: SlotMeta = {
      name,
      sourceType,
      remoteSrc,
      trimStart: 0,
      trimEnd: buffer.duration,
      fullDuration: buffer.duration,
      color: SLOT_COLORS[index],
    };
    kit.setSlot(index, meta, buffer);
  }
</script>

<div class="samples-page">
  <div class="browser-panel">
    <SampleBrowser on:add={handleAdd} />
  </div>
  <div class="kit-panel">
    <KitBuilder />
  </div>
</div>

<style>
  .samples-page {
    display: flex; flex: 1; overflow: hidden;
    font-family: var(--font-body);
  }
  .browser-panel {
    flex: 1; overflow: hidden;
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
  }
  .kit-panel {
    width: 300px; flex-shrink: 0; overflow: hidden;
    display: flex; flex-direction: column;
  }
</style>
