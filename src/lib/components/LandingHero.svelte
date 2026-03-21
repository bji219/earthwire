<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  let isChromium = false;

  onMount(() => {
    isChromium = !!(navigator as any).userAgentData?.brands?.some(
      (b: any) => b.brand === 'Chromium'
    ) || /Chrome/.test(navigator.userAgent);
  });
</script>

<div class="hero">
  <h1 class="title">Earthwire</h1>
  <p class="tagline">Stream live data from the planet into your music.</p>

  <p class="description">
    Earthquakes, the ISS, bird migrations — transformed into MIDI signals
    for your DAW, synth, or modular rig. In real time.
  </p>

  <button class="try-it" on:click={() => dispatch('start')}>
    Try it
  </button>

  {#if !isChromium}
    <p class="browser-note">
      The demo synth works in any browser. For MIDI output,
      use Chrome, Edge, Arc, or Brave.
    </p>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);
  }
  .title {
    font-size: 4rem;
    font-weight: 800;
    margin: 0 0 0.5rem;
    background: linear-gradient(135deg, #4ecdc4, #44b09e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .tagline {
    font-size: 1.5rem;
    color: #ccc;
    margin: 0 0 1.5rem;
    max-width: 500px;
  }
  .description {
    color: #888;
    max-width: 450px;
    line-height: 1.6;
    margin: 0 0 2rem;
  }
  .try-it {
    padding: 1rem 3rem;
    font-size: 1.25rem;
    font-weight: bold;
    background: linear-gradient(135deg, #4ecdc4, #44b09e);
    color: #000;
    border: none;
    border-radius: 50px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .try-it:hover {
    transform: scale(1.05);
    box-shadow: 0 0 30px rgba(78, 205, 196, 0.3);
  }
  .browser-note {
    margin-top: 1.5rem;
    font-size: 0.85rem;
    color: #666;
    max-width: 400px;
  }
</style>
