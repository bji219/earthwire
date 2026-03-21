<script lang="ts">
  import TopBar from '$lib/components/TopBar.svelte';
  import ChannelStrip from '$lib/components/ChannelStrip.svelte';
  import { patch } from '$lib/stores/patch.js';
  import type { ChannelConfig } from '$lib/engine/types.js';

  function addChannel() {
    const newChannel: ChannelConfig = {
      sourceId: 'usgs-earthquakes',
      fieldId: 'magnitude',
      normalizer: { mode: 'auto' },
      smoother: { amount: 0.3 },
      quantizer: null,
      threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    };
    patch.addChannel(newChannel);
  }
</script>

<div class="app">
  <TopBar />

  <main class="channels">
    {#each $patch.channels as channel, i (i)}
      <ChannelStrip {channel} index={i} />
    {/each}

    <button class="add-channel" on:click={addChannel}>+ Add Channel</button>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a1a;
    color: #fff;
  }
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .channels {
    flex: 1;
  }
  .add-channel {
    width: 100%;
    padding: 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid #333;
    color: #4ecdc4;
    font-size: 1rem;
    cursor: pointer;
  }
  .add-channel:hover {
    background: #252525;
  }
</style>
