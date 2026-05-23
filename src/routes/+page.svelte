<script lang="ts">
  import SampleBrowser from '$lib/components/SampleBrowser.svelte';
  import KitBuilder    from '$lib/components/KitBuilder.svelte';
  import LandingHero   from '$lib/components/LandingHero.svelte';
  import { kit } from '$lib/stores/kit';
  import { SLOT_COLORS, PLAY_MODE_DEFAULT } from '$lib/kit/types';
  import type { SlotMeta } from '$lib/kit/types';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  const SEEN_KEY = 'earthwire.seen.kit';
  let started = false;

  onMount(() => {
    if (browser && localStorage.getItem(SEEN_KEY) === '1') {
      started = true;
    }
  });

  function handleStart() {
    if (browser) localStorage.setItem(SEEN_KEY, '1');
    started = true;
  }

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
      playMode: PLAY_MODE_DEFAULT,
    };
    kit.setSlot(index, meta, buffer);
  }
</script>

{#if !started}
  <LandingHero on:start={handleStart} />
{:else}
  <div class="samples-page">
    <div class="browser-panel">
      <SampleBrowser on:add={handleAdd} />
    </div>
    <div class="kit-panel">
      <KitBuilder />
    </div>
  </div>
{/if}

<style>
  .samples-page {
    display: flex; flex: 1; overflow: hidden;
    font-family: var(--font-body);
  }
  .browser-panel {
    flex: 1; min-width: 0; max-width: 55%; overflow: hidden;
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
  }
  .kit-panel {
    flex: 1; min-width: 380px; max-width: 45%; overflow: hidden;
    display: flex; flex-direction: column;
  }

  @media (max-width: 768px) {
    .samples-page {
      flex-direction: column;
      overflow: visible;
    }
    .browser-panel {
      max-width: 100%;
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--border);
      min-height: 60vh;
    }
    .kit-panel {
      max-width: 100%;
      min-width: 0;
      width: 100%;
    }
  }
</style>
