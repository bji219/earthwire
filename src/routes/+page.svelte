<script lang="ts">
  import TopBar from '$lib/components/TopBar.svelte';
  import ChannelStrip from '$lib/components/ChannelStrip.svelte';
  import DemoSynthControls from '$lib/components/DemoSynthControls.svelte';
  import LandingHero from '$lib/components/LandingHero.svelte';
  import { patch } from '$lib/stores/patch.js';
  import { DemoSynth } from '$lib/outputs/demo-synth.js';
  import { createDefaultRegistry } from '$lib/sources/index.js';
  import { EarthwireEngine } from '$lib/engine/engine.js';
  import type { ChannelConfig } from '$lib/engine/types.js';
  import { onDestroy } from 'svelte';

  let started = false;
  let synth: DemoSynth | null = null;
  let engine: EarthwireEngine | null = null;
  const registry = createDefaultRegistry();

  async function handleStart() {
    synth = new DemoSynth();
    await synth.init();
    synth.start();

    engine = new EarthwireEngine();

    // Load default patch: earthquakes → demo synth filter
    const defaultChannel: ChannelConfig = {
      sourceId: 'usgs-earthquakes',
      fieldId: 'magnitude',
      normalizer: { mode: 'auto' },
      smoother: { amount: 0.3 },
      quantizer: null,
      threshold: null,
      output: { type: 'demo-synth', param: 'filter-cutoff' }
    };
    patch.addChannel(defaultChannel);
    engine.addChannel(defaultChannel);

    // Connect earthquake source and route updates
    try {
      const source = await registry.acquire('usgs-earthquakes');
      source.onUpdate((update) => {
        if (!engine || !synth) return;
        if (update.fieldId === 'magnitude') {
          const output = engine.processValue(0, update.value);
          if ($patch.channels[0]?.output.type === 'demo-synth') {
            synth.setFilterCutoff(output.continuous);
          }
        }
      });
    } catch {
      // Source unavailable, demo synth still works
    }

    started = true;
  }

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
    engine?.addChannel(newChannel);
  }

  onDestroy(() => {
    synth?.destroy();
  });
</script>

{#if !started}
  <LandingHero on:start={handleStart} />
{:else}
  <div class="app">
    <TopBar />

    <main class="channels">
      {#each $patch.channels as channel, i (i)}
        <ChannelStrip {channel} index={i} />
      {/each}

      <button class="add-channel" on:click={addChannel}>+ Add Channel</button>
    </main>

    <DemoSynthControls {synth} />

    <div class="daw-banner">
      Connect to your DAW for the full experience &mdash;
      <a href="/docs/getting-started" target="_blank">Setup Guide</a>
    </div>
  </div>
{/if}

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
  .daw-banner {
    text-align: center;
    padding: 0.5rem;
    background: #252525;
    color: #888;
    font-size: 0.85rem;
  }
  .daw-banner a {
    color: #4ecdc4;
  }
</style>
