<script lang="ts">
  import type { ChannelConfig } from '$lib/engine/types.js';
  import { patch } from '$lib/stores/patch.js';
  import { createEventDispatcher } from 'svelte';

  export let channel: ChannelConfig;
  export let index: number;

  const dispatch = createEventDispatcher();

  const SOURCES = [
    { id: 'usgs-earthquakes', name: 'Earthquakes', icon: '🌋' },
    { id: 'iss-position', name: 'ISS Position', icon: '🔭' },
    { id: 'ebird-activity', name: 'Bird Activity', icon: '🐦' }
  ];

  const SOURCE_FIELDS: Record<string, { id: string; name: string }[]> = {
    'usgs-earthquakes': [
      { id: 'magnitude', name: 'Magnitude' },
      { id: 'depth', name: 'Depth' },
      { id: 'latitude', name: 'Latitude' },
      { id: 'longitude', name: 'Longitude' }
    ],
    'iss-position': [
      { id: 'latitude', name: 'Latitude' },
      { id: 'longitude', name: 'Longitude' },
      { id: 'altitude', name: 'Altitude' },
      { id: 'velocity', name: 'Velocity' }
    ],
    'ebird-activity': [
      { id: 'observation-count', name: 'Observation Count' },
      { id: 'total-individuals', name: 'Total Individuals' },
      { id: 'species-diversity', name: 'Species Diversity' }
    ]
  };

  const SCALES = ['chromatic', 'major', 'minor', 'pentatonic', 'blues', 'dorian', 'mixolydian'];

  function updateChannel(updates: Partial<ChannelConfig>) {
    patch.updateChannel(index, { ...channel, ...updates });
  }

  function handleSourceChange(e: Event) {
    const sourceId = (e.target as HTMLSelectElement).value;
    const fields = SOURCE_FIELDS[sourceId];
    updateChannel({ sourceId, fieldId: fields?.[0]?.id ?? '' });
  }

  function handleSmoothing(e: Event) {
    const amount = parseFloat((e.target as HTMLInputElement).value);
    updateChannel({ smoother: { amount } });
  }

  function remove() {
    patch.removeChannel(index);
  }
</script>

<div class="channel-strip">
  <div class="source-section">
    <select value={channel.sourceId} on:change={handleSourceChange}>
      {#each SOURCES as source}
        <option value={source.id}>{source.icon} {source.name}</option>
      {/each}
    </select>

    <select value={channel.fieldId} on:change={(e) => updateChannel({ fieldId: (e.target as HTMLSelectElement).value })}>
      {#each SOURCE_FIELDS[channel.sourceId] ?? [] as field}
        <option value={field.id}>{field.name}</option>
      {/each}
    </select>
  </div>

  <div class="processing-section">
    <label>
      Norm
      <select
        value={channel.normalizer.mode}
        on:change={(e) => updateChannel({ normalizer: { ...channel.normalizer, mode: (e.target as HTMLSelectElement).value as 'auto' | 'manual' } })}
      >
        <option value="auto">Auto</option>
        <option value="manual">Manual</option>
      </select>
    </label>

    <label>
      Smooth
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={channel.smoother?.amount ?? 0}
        on:input={handleSmoothing}
      />
    </label>
  </div>

  <div class="output-section">
    <select
      value={channel.output.type}
      on:change={(e) => {
        const type = (e.target as HTMLSelectElement).value;
        if (type === 'midi-cc') updateChannel({ output: { type: 'midi-cc', channel: 1, cc: 1 } });
        else if (type === 'midi-note') updateChannel({ output: { type: 'midi-note', channel: 1 } });
        else if (type === 'midi-trigger') updateChannel({ output: { type: 'midi-trigger', channel: 1, note: 60 } });
        else if (type === 'demo-synth') updateChannel({ output: { type: 'demo-synth', param: 'filter-cutoff' } });
      }}
    >
      <option value="midi-cc">MIDI CC</option>
      <option value="midi-note">MIDI Note</option>
      <option value="midi-trigger">MIDI Trigger</option>
      <option value="demo-synth">Demo Synth</option>
    </select>
  </div>

  <div class="meter">
    <div class="meter-bar" style="width: 0%"></div>
  </div>

  <button class="remove-btn" on:click={remove}>×</button>
</div>

<style>
  .channel-strip {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #333;
    background: #222;
    color: #fff;
  }
  .source-section, .processing-section, .output-section {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  select, input[type='range'] {
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 0.25rem;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #aaa;
  }
  .meter {
    flex: 1;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    min-width: 80px;
  }
  .meter-bar {
    height: 100%;
    background: #4ecdc4;
    transition: width 100ms;
  }
  .remove-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
  }
  .remove-btn:hover {
    color: #ff6b6b;
  }
</style>
