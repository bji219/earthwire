<script lang="ts">
  import { patch } from '$lib/stores/patch.js';
  import { outputPorts, selectedPortId, initMidi } from '$lib/stores/midi.js';
  import { onMount } from 'svelte';

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
  <div class="controls">
    <label>
      BPM
      <input type="number" min="1" max="300" value={$patch.bpm} on:change={handleBpmChange} />
    </label>
    {#if midiAvailable}
      <label>
        MIDI Out
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
    <button on:click={handleExport}>Export</button>
    <button on:click={handleImport}>Import</button>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #333;
    background: #1a1a1a;
    color: #fff;
  }
  .logo {
    font-size: 1.25rem;
    font-weight: bold;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  input[type='number'] {
    width: 4rem;
    padding: 0.25rem;
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
  }
  select {
    padding: 0.25rem;
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
  }
  button {
    padding: 0.25rem 0.75rem;
    background: #333;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background: #444;
  }
  .midi-unavailable {
    color: #888;
    font-size: 0.85rem;
  }
</style>
