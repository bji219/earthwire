<script lang="ts">
  import type { DemoSynth } from '$lib/outputs/demo-synth.js';

  export let synth: DemoSynth | null = null;

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
</script>

{#if synth}
  <div class="demo-synth-controls">
    <span class="label">Demo Synth</span>

    <label>
      Wave
      <select value={waveform} on:change={handleWaveform}>
        <option value="sawtooth">Saw</option>
        <option value="square">Square</option>
        <option value="sine">Sine</option>
        <option value="triangle">Triangle</option>
      </select>
    </label>

    <label>
      Filter
      <input type="range" min="0" max="1" step="0.01" value={filterValue} on:input={handleFilter} />
    </label>

    <label>
      Reverb
      <input type="range" min="0" max="1" step="0.01" value={reverbValue} on:input={handleReverb} />
    </label>

    <span class="status">{synth.active ? '🔊' : '🔇'}</span>
  </div>
{/if}

<style>
  .demo-synth-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: #1e1e1e;
    border-top: 1px solid #333;
    color: #fff;
  }
  .label {
    font-weight: bold;
    font-size: 0.85rem;
    color: #4ecdc4;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #aaa;
  }
  select {
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 0.25rem;
  }
  .status {
    margin-left: auto;
  }
</style>
