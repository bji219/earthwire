<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DemoSynth } from '$lib/outputs/demo-synth.js';

  const dispatch = createEventDispatcher<{ togglemute: void }>();

  export let synth: DemoSynth | null = null;
  export let active = false;

  let waveform: OscillatorType = 'sawtooth';
  let filterValue = 0.5;
  let reverbValue = 0.3;
  function handleWaveform(e: Event) {
    waveform = (e.target as HTMLSelectElement).value as OscillatorType;
    synth?.setWaveform(waveform);
  }

  function handleFilter(e: Event) {
    filterValue = parseFloat((e.target as HTMLInputElement).value);
    synth?.setFilterCutoff(filterValue);
  }

  function handleReverb(e: Event) {
    reverbValue = parseFloat((e.target as HTMLInputElement).value);
    synth?.setReverbMix(reverbValue);
  }

  function toggleMute() {
    dispatch('togglemute');
  }
</script>

{#if synth}
  <div class="demo-synth-controls">
    <span class="title-label">Demo Synth</span>

    <label>
      <span class="label-text">Wave</span>
      <select value={waveform} on:change={handleWaveform}>
        <option value="sawtooth">Saw</option>
        <option value="square">Square</option>
        <option value="sine">Sine</option>
        <option value="triangle">Triangle</option>
      </select>
    </label>

    <label>
      <span class="label-text">Filter</span>
      <input type="range" min="0" max="1" step="0.01" value={filterValue} on:input={handleFilter} />
    </label>

    <label>
      <span class="label-text">Reverb</span>
      <input type="range" min="0" max="1" step="0.01" value={reverbValue} on:input={handleReverb} />
    </label>

    <button class="mute-btn" class:muted={!active} on:click={toggleMute}>
      {active ? '🔊 On' : '🔇 Muted'}
    </button>
  </div>
{/if}

<style>
  .demo-synth-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 1.5rem;
    background: var(--bg-input);
    border-top: 1px solid var(--border-light);
  }
  .title-label {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 0.9rem;
    color: var(--text-primary);
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .label-text {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  select {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.4rem;
    font-family: var(--font-body);
    font-size: 0.8rem;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }
  input[type='range'] {
    accent-color: var(--accent);
  }
  .mute-btn {
    margin-left: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all 150ms;
  }
  .mute-btn:hover {
    background: var(--bg-tertiary);
  }
  .mute-btn.muted {
    color: var(--text-muted);
    background: var(--bg-secondary);
  }

  @media (max-width: 768px) {
    .demo-synth-controls {
      flex-wrap: wrap;
      gap: 0.55rem;
      padding: 0.6rem 0.75rem;
    }
    .title-label {
      flex-basis: 100%;
      font-size: 0.95rem;
    }
    label {
      flex: 1 1 calc(50% - 0.3rem);
      gap: 0.4rem;
    }
    label select,
    label input[type='range'] {
      flex: 1;
      min-width: 0;
    }
    select {
      font-size: 0.9rem;
      padding: 0.45rem 0.5rem;
      min-height: 36px;
    }
    input[type='range'] {
      width: 100%;
      height: 32px;
    }
    .mute-btn {
      flex-basis: 100%;
      margin-left: 0;
      padding: 0.55rem 1rem;
      font-size: 0.9rem;
      min-height: 40px;
    }
  }
</style>
