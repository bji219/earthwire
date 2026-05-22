<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let overline: string = 'OP-1 Drum Kit Designer';
  export let tagline: string = 'Build OP-1 / OP-1 Field drum kits from sounds across the planet.';
  export let description: string = 'Search Freesound and Xeno-canto, trim and arrange 24 slots, then export a ready-to-load .aif for your OP-1. Or stream live scientific data into MIDI signals for your DAW.';
  export let primaryLabel: string = 'Build a Kit';
  export let secondaryLabel: string = 'Open Sequencer →';
  export let secondaryHref: string = '/sequencer';
  export let docsHref: string = '/docs/getting-started';
  export let showMidiNote: boolean = false;

  const dispatch = createEventDispatcher();

  let isChromium = false;
  let visible = false;

  onMount(() => {
    isChromium = !!(navigator as any).userAgentData?.brands?.some(
      (b: any) => b.brand === 'Chromium'
    ) || /Chrome/.test(navigator.userAgent);
    requestAnimationFrame(() => { visible = true; });
  });
</script>

<div class="hero" class:visible>
  <div class="hero-content">
    <p class="overline">{overline}</p>
    <h1 class="title">Earthwire</h1>
    <p class="tagline">{tagline}</p>

    <p class="description">{description}</p>

    <div class="cta-row">
      <button class="cta-primary" on:click={() => dispatch('start')}>
        {primaryLabel}
      </button>
      <a class="cta-secondary" href={secondaryHref}>
        {secondaryLabel}
      </a>
    </div>

    <a class="cta-tertiary" href={docsHref}>Getting Started →</a>

    {#if showMidiNote && !isChromium}
      <p class="browser-note">
        The demo synth works in any browser. For MIDI output,
        use Chrome, Edge, Arc, or Brave.
      </p>
    {/if}
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
    opacity: 0;
    transition: opacity 600ms ease;
  }
  .hero.visible { opacity: 1; }
  .hero-content {
    transform: translateY(10px);
    transition: transform 600ms ease;
  }
  .hero.visible .hero-content { transform: translateY(0); }
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
    max-width: 460px;
    line-height: 1.7;
    margin: 0 auto 2.5rem;
    font-size: 0.95rem;
  }
  .cta-row {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .cta-primary, .cta-secondary {
    padding: 0.875rem 2.5rem;
    font-size: 1rem;
    font-family: var(--font-body);
    font-weight: 600;
    border-radius: 24px;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: transform 200ms, box-shadow 200ms, background 200ms, border-color 200ms;
    text-decoration: none;
    display: inline-block;
  }
  .cta-primary {
    background: var(--accent);
    color: #fff;
    border: none;
  }
  .cta-primary:hover {
    transform: translateY(-1px);
    background: var(--accent-light);
    box-shadow: 0 8px 24px rgba(26, 107, 90, 0.2);
  }
  .cta-secondary {
    background: transparent;
    color: var(--accent);
    border: 1.5px solid var(--accent);
  }
  .cta-secondary:hover {
    transform: translateY(-1px);
    background: var(--accent);
    color: #fff;
    box-shadow: 0 8px 24px rgba(26, 107, 90, 0.2);
  }
  .cta-primary:active, .cta-secondary:active { transform: translateY(0); }
  .cta-tertiary {
    display: inline-block;
    margin-top: 1.25rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    text-decoration: none;
    font-family: var(--font-body);
    transition: color 150ms;
  }
  .cta-tertiary:hover { color: var(--accent); text-decoration: underline; }
  .browser-note {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    max-width: 400px;
  }
</style>
