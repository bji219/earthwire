<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  let isChromium = false;
  let visible = false;

  onMount(() => {
    isChromium = !!(navigator as any).userAgentData?.brands?.some(
      (b: any) => b.brand === 'Chromium'
    ) || /Chrome/.test(navigator.userAgent);
    // Stagger entrance
    requestAnimationFrame(() => { visible = true; });
  });
</script>

<div class="hero" class:visible>
  <div class="hero-content">
    <p class="overline">Scientific Data → Sound</p>
    <h1 class="title">Earthwire</h1>
    <p class="tagline">Stream live data from the planet into your music.</p>

    <p class="description">
      Earthquakes, the ISS, ocean sensors, bird migrations — transformed into
      MIDI signals for your DAW, synth, or modular rig.
    </p>

    <button class="try-it" on:click={() => dispatch('start')}>
      Start Listening
    </button>

    {#if !isChromium}
      <p class="browser-note">
        The demo synth works in any browser. For MIDI output,
        use Chrome, Edge, Arc, or Brave.
      </p>
    {/if}
  </div>

  <div class="hero-decoration">
    <svg viewBox="0 0 400 200" class="wave-svg" aria-hidden="true">
      <path d="M0,100 C50,60 100,140 150,100 C200,60 250,140 300,100 C350,60 400,140 400,100" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.3"/>
      <path d="M0,110 C60,70 120,150 180,110 C240,70 300,150 360,110 L400,110" fill="none" stroke="var(--accent-light)" stroke-width="1" opacity="0.2"/>
      <path d="M0,90 C40,50 80,130 120,90 C160,50 200,130 240,90 C280,50 320,130 360,90 L400,90" fill="none" stroke="var(--accent)" stroke-width="1" opacity="0.15"/>
    </svg>
  </div>
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
    background: var(--bg-primary);
    position: relative;
    overflow: hidden;
    opacity: 0;
    transition: opacity 600ms ease;
  }
  .hero.visible {
    opacity: 1;
  }
  .hero-content {
    position: relative;
    z-index: 1;
    transform: translateY(10px);
    transition: transform 600ms ease;
  }
  .hero.visible .hero-content {
    transform: translateY(0);
  }
  .overline {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 1rem;
  }
  .title {
    font-family: var(--font-display);
    font-size: 4.5rem;
    font-weight: 400;
    margin: 0 0 0.75rem;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }
  .tagline {
    font-size: 1.35rem;
    color: var(--text-secondary);
    margin: 0 0 1.5rem;
    max-width: 500px;
    font-weight: 400;
  }
  .description {
    color: var(--text-muted);
    max-width: 440px;
    line-height: 1.7;
    margin: 0 auto 2.5rem;
    font-size: 0.95rem;
  }
  .try-it {
    padding: 0.875rem 2.5rem;
    font-size: 1rem;
    font-family: var(--font-body);
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 24px;
    cursor: pointer;
    transition: transform 200ms, box-shadow 200ms, background 200ms;
    letter-spacing: 0.02em;
  }
  .try-it:hover {
    transform: translateY(-1px);
    background: var(--accent-light);
    box-shadow: 0 8px 24px rgba(26, 107, 90, 0.2);
  }
  .try-it:active {
    transform: translateY(0);
  }
  .browser-note {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    max-width: 400px;
  }
  .hero-decoration {
    position: absolute;
    bottom: 10%;
    left: 0;
    right: 0;
    pointer-events: none;
    opacity: 0.6;
  }
  .wave-svg {
    width: 100%;
    height: auto;
  }
</style>
