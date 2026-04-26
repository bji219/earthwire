<script lang="ts">
  import { patch } from '$lib/stores/patch.js';
  import { isPlaying, subdivision, swing } from '$lib/stores/clock.js';
  import { outputPorts, selectedPortId, initMidi } from '$lib/stores/midi.js';
  import type { BeatSubdivision } from '$lib/nodes/types.js';
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let midiAvailable = false;

  onMount(async () => {
    midiAvailable = await initMidi();
  });

  function handleBpmChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (value > 0 && value <= 300) {
      patch.setBpm(value);
    }
  }

  function handleSubdivisionChange(e: Event) {
    $subdivision = (e.target as HTMLSelectElement).value as BeatSubdivision;
  }

  function handleSwingChange(e: Event) {
    $swing = parseFloat((e.target as HTMLInputElement).value);
  }

  function togglePlay() {
    $isPlaying = !$isPlaying;
  }

  function handleStop() {
    $isPlaying = false;
    dispatch('stop');
  }

  function handleExport() {
    const json = patch.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$patch.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      patch.importJson(text);
    };
    input.click();
  }
</script>

<header class="topbar">
  <div class="logo">Earthwire</div>
  <a href="/samples" class="samples-link">Samples</a>

  <div class="transport">
    <button class="transport-btn" class:active={$isPlaying} on:click={togglePlay}>
      {#if $isPlaying}
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="3" height="10" fill="currentColor"/><rect x="8" y="1" width="3" height="10" fill="currentColor"/></svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
      {/if}
    </button>
    <button class="transport-btn stop" on:click={handleStop}>
      <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" fill="currentColor"/></svg>
    </button>
  </div>

  <div class="controls">
    <label>
      <span class="label-text">BPM</span>
      <input type="number" min="1" max="300" value={$patch.bpm} on:change={handleBpmChange} />
    </label>

    <label>
      <span class="label-text">Div</span>
      <select value={$subdivision} on:change={handleSubdivisionChange}>
        <option value="1/4">1/4</option>
        <option value="1/8">1/8</option>
        <option value="1/16">1/16</option>
        <option value="1/32">1/32</option>
        <option value="1/4T">1/4T</option>
        <option value="1/8T">1/8T</option>
        <option value="1/16T">1/16T</option>
      </select>
    </label>

    <label class="swing-label">
      <span class="label-text">Swing {$swing}%</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={$swing}
        on:input={handleSwingChange}
      />
    </label>

    {#if midiAvailable}
      <label>
        <span class="label-text">MIDI Out</span>
        <select bind:value={$selectedPortId}>
          <option value={null}>None</option>
          {#each $outputPorts as port}
            <option value={port.id}>{port.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <span class="midi-unavailable">MIDI not available</span>
    {/if}

    <div class="actions">
      <button on:click={handleExport}>Export</button>
      <button on:click={handleImport}>Import</button>
    </div>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 1.5rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .logo {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }
  .samples-link {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    transition: color 150ms;
  }
  .samples-link:hover { color: var(--accent); }
  .transport {
    display: flex;
    gap: 0.25rem;
  }
  .transport-btn {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 50%;
    cursor: pointer;
    transition: all 150ms;
  }
  .transport-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .transport-btn.active {
    background: var(--accent-bg);
    color: var(--accent);
    border-color: var(--accent);
  }
  .transport-btn.stop:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
  }
  input[type='number'] {
    width: 3.5rem;
    padding: 0.3rem 0.4rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
  input[type='number']:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }
  input[type='range'] {
    width: 4.5rem;
    vertical-align: middle;
    accent-color: var(--accent);
  }
  select {
    padding: 0.3rem 0.4rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--font-body);
    font-size: 0.8rem;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }
  .label-text {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .actions {
    display: flex;
    gap: 0.35rem;
  }
  button {
    padding: 0.3rem 0.65rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 150ms;
  }
  button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .midi-unavailable {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
</style>
