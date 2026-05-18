<script lang="ts">
  import type { ChannelConfig, LfoSourceConfig, LFOShape } from '$lib/engine/types.js';
  import type { TimeRangePreset } from '$lib/sources/types.js';
  import type { SmootherMode } from '$lib/nodes/types.js';
  import { patch } from '$lib/stores/patch.js';
  import { createEventDispatcher } from 'svelte';

  export let channel: ChannelConfig;
  export let index: number;

  const dispatch = createEventDispatcher();

  const SOURCES = [
    { id: 'usgs-earthquakes', name: 'Earthquakes', icon: '🌋' },
    { id: 'iss-position', name: 'ISS Position', icon: '🔭' },
    { id: 'ebird-activity', name: 'Bird Activity', icon: '🐦' },
    { id: 'mbari-ocean', name: 'MBARI Ocean', icon: '🌊' },
    { id: 'solar-wind', name: 'Solar Wind', icon: '☀️' },
    { id: 'lfo', name: 'LFO', icon: '〜' }
  ];

  const SOURCE_INFO: Record<string, { url: string; description: string }> = {
    'usgs-earthquakes': { url: 'https://earthquake.usgs.gov/', description: 'USGS Earthquake Hazards Program' },
    'iss-position': { url: 'https://celestrak.org/', description: 'CelesTrak TLE Orbital Data' },
    'ebird-activity': { url: 'https://ebird.org/', description: 'Cornell Lab of Ornithology eBird' },
    'mbari-ocean': { url: 'https://stoqs.mbari.org/', description: 'MBARI STOQS Database' },
    'solar-wind': { url: 'https://www.swpc.noaa.gov/', description: 'NOAA Space Weather Prediction Center' }
  };

  const EBIRD_REGIONS = [
    { id: 'US', name: 'United States' },
    { id: 'US-CA', name: 'California' },
    { id: 'US-NY', name: 'New York' },
    { id: 'US-TX', name: 'Texas' },
    { id: 'US-FL', name: 'Florida' },
    { id: 'US-WA', name: 'Washington' },
    { id: 'US-CO', name: 'Colorado' },
    { id: 'CA', name: 'Canada' },
    { id: 'MX', name: 'Mexico' },
    { id: 'GB', name: 'United Kingdom' },
    { id: 'AU', name: 'Australia' }
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
      { id: 'observation-count', name: 'Individuals' },
      { id: 'species-diversity', name: 'Cumulative Species' },
      { id: 'latitude', name: 'Latitude' }
    ],
    'mbari-ocean': [
      { id: 'depth-temperature', name: 'Depth (Temperature)' },
      { id: 'depth-salinity', name: 'Depth (Salinity)' },
      { id: 'depth-oxygen', name: 'Depth (Oxygen)' },
      { id: 'chlorophyll', name: 'Chlorophyll' },
      { id: 'fluorescence', name: 'Fluorescence' },
      { id: 'nitrate', name: 'Nitrate' }
    ],
    'solar-wind': [
      { id: 'wind-speed', name: 'Wind Speed' },
      { id: 'wind-density', name: 'Plasma Density' },
      { id: 'wind-temperature', name: 'Plasma Temperature' },
      { id: 'flare-intensity', name: 'Solar Flare Class' }
    ]
  };

  const SCALES = ['chromatic', 'major', 'minor', 'pentatonic', 'blues', 'dorian', 'mixolydian'];

  function updateChannel(updates: Partial<ChannelConfig>) {
    patch.updateChannel(index, { ...channel, ...updates });
  }

  function handleSourceChange(e: Event) {
    const sourceId = (e.target as HTMLSelectElement).value;
    if (sourceId === 'lfo') {
      updateChannel({ sourceId, fieldId: 'lfo', location: undefined, lfoConfig: { shape: 'sine', rate: 1 } });
      return;
    }
    const fields = SOURCE_FIELDS[sourceId];
    updateChannel({ sourceId, fieldId: fields?.[0]?.id ?? '', location: undefined, lfoConfig: undefined });
  }

  function handleRegionChange(e: Event) {
    const region = (e.target as HTMLSelectElement).value;
    updateChannel({ location: { lat: 0, lng: 0, radiusKm: 0, region } });
  }

  function handleRadiusChange(e: Event) {
    const radiusKm = parseInt((e.target as HTMLInputElement).value, 10);
    updateChannel({ location: { ...channel.location!, radiusKm } });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lng = Math.round(pos.coords.longitude * 100) / 100;
      updateChannel({ location: { lat, lng, radiusKm: channel.location?.radiusKm ?? 500 } });
    });
  }

  function clearLocation() {
    updateChannel({ location: undefined });
  }

  $: hasLocationFilter = channel.sourceId === 'usgs-earthquakes' || channel.sourceId === 'ebird-activity';

  function handleSmoothing(e: Event) {
    const amount = parseFloat((e.target as HTMLInputElement).value);
    updateChannel({ smoother: { mode: channel.smoother?.mode ?? 'smooth', amount } });
  }

  function handleSmoothModeChange(e: Event) {
    const mode = (e.target as HTMLSelectElement).value as SmootherMode;
    updateChannel({ smoother: { mode, amount: channel.smoother?.amount ?? 0 } });
  }

  function handleLfoSourceShape(e: Event) {
    const shape = (e.target as HTMLSelectElement).value as LFOShape;
    updateChannel({ lfoConfig: { ...channel.lfoConfig!, shape } });
  }

  function handleLfoSourceRate(e: Event) {
    const rate = parseFloat((e.target as HTMLInputElement).value);
    updateChannel({ lfoConfig: { ...channel.lfoConfig!, rate } });
  }

  $: lfoRateDisplay = channel.lfoConfig
    ? channel.lfoConfig.rate < 1
      ? `${(channel.lfoConfig.rate * 1000).toFixed(0)}ms`
      : `${channel.lfoConfig.rate.toFixed(2)}Hz`
    : '';

  function handleTickRate(e: Event) {
    const pct = parseInt((e.target as HTMLInputElement).value, 10);
    updateChannel({ tickRate: pct / 100 });
  }

  $: tickRatePct = Math.round((channel.tickRate ?? 1) * 100);

  function remove() {
    patch.removeChannel(index);
  }

  function handleFieldChange(e: Event) {
    updateChannel({ fieldId: (e.target as HTMLSelectElement).value });
  }

  function handleNormModeChange(e: Event) {
    const mode = (e.target as HTMLSelectElement).value as 'auto' | 'manual';
    updateChannel({ normalizer: { ...channel.normalizer, mode } });
  }

  function handleTimeRangeChange(e: Event) {
    const timeRange = (e.target as HTMLSelectElement).value as TimeRangePreset;
    updateChannel({ timeRange });
  }

  function handleOutputTypeChange(e: Event) {
    const type = (e.target as HTMLSelectElement).value;
    // Preserve current MIDI channel when switching between MIDI output types
    const currentMidiCh = 'channel' in channel.output ? channel.output.channel : 1;
    if (type === 'midi-cc') {
      updateChannel({ output: { type: 'midi-cc', channel: currentMidiCh, cc: 1 } });
    } else if (type === 'midi-note') {
      updateChannel({
        output: { type: 'midi-note', channel: currentMidiCh },
        quantizer: channel.quantizer ?? { root: 0, scale: 'chromatic' }
      });
    } else if (type === 'midi-trigger') {
      updateChannel({
        output: { type: 'midi-trigger', channel: currentMidiCh, note: 60 },
        threshold: channel.threshold ?? { level: 0.5, direction: 'rising', beatQuantize: null }
      });
    } else if (type === 'cv') {
      updateChannel({ output: { type: 'cv', audioChannel: 0 } });
    } else if (type === 'demo-synth') {
      updateChannel({ output: { type: 'demo-synth', param: 'filter-cutoff' } });
    }
  }

  function handleMidiChannelChange(e: Event) {
    const ch = parseInt((e.target as HTMLSelectElement).value, 10);
    updateChannel({ output: { ...channel.output, channel: ch } as any });
  }

  function handleCcNumberChange(e: Event) {
    const cc = parseInt((e.target as HTMLInputElement).value, 10);
    if (channel.output.type === 'midi-cc' && cc >= 0 && cc <= 127) {
      updateChannel({ output: { ...channel.output, cc } });
    }
  }

  function handleAudioChannelChange(e: Event) {
    const audioChannel = parseInt((e.target as HTMLSelectElement).value, 10);
    if (channel.output.type === 'cv') {
      updateChannel({ output: { ...channel.output, audioChannel } });
    }
  }

</script>

<div class="channel-strip">
  <div class="channel-index">Ch {index}</div>

  <div class="source-section">
    <select value={channel.sourceId} on:change={handleSourceChange}>
      {#each SOURCES as source}
        <option value={source.id}>{source.icon} {source.name}</option>
      {/each}
    </select>

    <a
      class="info-btn"
      href={SOURCE_INFO[channel.sourceId]?.url}
      target="_blank"
      rel="noopener"
      title={SOURCE_INFO[channel.sourceId]?.description}
    >
      <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="7" y="10.5" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor">i</text></svg>
    </a>

    {#if channel.sourceId !== 'lfo'}
      <select value={channel.fieldId} on:change={handleFieldChange}>
        {#each SOURCE_FIELDS[channel.sourceId] ?? [] as field}
          <option value={field.id}>{field.name}</option>
        {/each}
      </select>

      <select value={channel.timeRange ?? 'day'} on:change={handleTimeRangeChange}>
        <option value="hour">1 Hour</option>
        <option value="day">1 Day</option>
        <option value="week">1 Week</option>
        <option value="month">1 Month</option>
      </select>
    {/if}

    {#if channel.sourceId === 'lfo' && channel.lfoConfig}
      <select class="lfo-select" value={channel.lfoConfig.shape} on:change={handleLfoSourceShape}>
        <option value="sine">Sine</option>
        <option value="triangle">Tri</option>
        <option value="square">Sq</option>
        <option value="saw">Saw↑</option>
        <option value="rsaw">Saw↓</option>
      </select>
      <input
        type="range"
        min="0.01"
        max="20"
        step="0.01"
        value={channel.lfoConfig.rate}
        on:input={handleLfoSourceRate}
        title="Rate: {lfoRateDisplay}"
      />
      <span class="rate-label">{lfoRateDisplay}</span>
    {/if}

    {#if channel.sourceId === 'ebird-activity'}
      <select value={channel.location?.region ?? 'US'} on:change={handleRegionChange}>
        {#each EBIRD_REGIONS as region}
          <option value={region.id}>{region.name}</option>
        {/each}
      </select>
    {/if}

    {#if channel.sourceId === 'usgs-earthquakes'}
      {#if channel.location?.lat}
        <span class="loc-label">{channel.location.lat},{channel.location.lng}</span>
        <input
          type="range"
          min="50"
          max="2000"
          step="50"
          value={channel.location.radiusKm}
          on:input={handleRadiusChange}
          title="Radius: {channel.location.radiusKm}km"
        />
        <span class="loc-label">{channel.location.radiusKm}km</span>
        <button class="loc-clear-btn" on:click={clearLocation} title="Switch back to global data">
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      {:else}
        <button class="loc-btn" on:click={useMyLocation} title="Filter earthquakes near your location">
          <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="2" fill="currentColor"/><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="6" y1="0" x2="6" y2="2.5" stroke="currentColor" stroke-width="0.8"/><line x1="6" y1="9.5" x2="6" y2="12" stroke="currentColor" stroke-width="0.8"/><line x1="0" y1="6" x2="2.5" y2="6" stroke="currentColor" stroke-width="0.8"/><line x1="9.5" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="0.8"/></svg>
        </button>
        <span class="loc-label">Global</span>
      {/if}
    {/if}
  </div>

  <div class="processing-section">
    <label>
      <span class="label-text">Norm</span>
      <select
        value={channel.normalizer.mode}
        on:change={handleNormModeChange}
      >
        <option value="auto">Auto</option>
        <option value="manual">Manual</option>
      </select>
    </label>

    <label>
      <span class="label-text">Smooth</span>
      <select value={channel.smoother?.mode ?? 'smooth'} on:change={handleSmoothModeChange}>
        <option value="smooth">Follow</option>
        <option value="deep-smooth">Smooth</option>
        <option value="glide">Glide</option>
        <option value="step">Step</option>
      </select>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={channel.smoother?.amount ?? 0}
        on:input={handleSmoothing}
      />
    </label>

    <label>
      <span class="label-text">Rate</span>
      <input
        type="range"
        min="25"
        max="400"
        step="5"
        value={tickRatePct}
        on:input={handleTickRate}
      />
      <span class="rate-label">{tickRatePct}%</span>
    </label>
  </div>

  <div class="output-section">
    <select
      value={channel.output.type}
      on:change={handleOutputTypeChange}
    >
      <option value="midi-cc">MIDI CC</option>
      <option value="midi-note">MIDI Note</option>
      <option value="midi-trigger">MIDI Trigger</option>
      <option value="cv">CV (Eurorack)</option>
      <option value="demo-synth">Demo Synth</option>
    </select>

    {#if channel.output.type === 'midi-cc' || channel.output.type === 'midi-note' || channel.output.type === 'midi-trigger'}
      <select value={channel.output.channel} on:change={handleMidiChannelChange}>
        {#each Array.from({length: 16}, (_, i) => i + 1) as ch}
          <option value={ch}>Ch {ch}</option>
        {/each}
      </select>
    {/if}

    {#if channel.output.type === 'midi-cc'}
      <label>
        <span class="label-text">CC</span>
        <input type="number" min="0" max="127" value={channel.output.cc}
          on:change={handleCcNumberChange} class="midi-num-input" />
      </label>
    {/if}

    {#if channel.output.type === 'cv'}
      <select value={channel.output.audioChannel} on:change={handleAudioChannelChange}>
        {#each Array.from({length: 8}, (_, i) => i) as ch}
          <option value={ch}>Ch {ch + 1}</option>
        {/each}
      </select>
    {/if}

  </div>

  <div class="meter">
    <div class="meter-bar" style="width: 0%"></div>
  </div>

  <button class="remove-btn" on:click={remove} title="Remove channel">
    <svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
  </button>
</div>

<style>
  .channel-strip {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    margin-bottom: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    transition: box-shadow 150ms;
  }
  .channel-strip:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  .channel-index {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 2rem;
  }
  .source-section, .processing-section, .output-section {
    display: flex;
    gap: 0.4rem;
    align-items: center;
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
    width: 4rem;
    accent-color: var(--accent);
  }
  .midi-num-input {
    width: 3.2rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.25rem 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-align: center;
  }
  .midi-num-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .label-text {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .meter {
    flex: 1;
    height: 6px;
    background: var(--bg-secondary);
    border-radius: 3px;
    overflow: hidden;
    min-width: 60px;
  }
  .meter-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 100ms;
  }
  .info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 150ms;
    flex-shrink: 0;
  }
  .info-btn:hover {
    color: var(--accent);
  }
  .loc-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem 0.35rem;
    transition: all 150ms;
  }
  .loc-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  .rate-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-muted);
    min-width: 2.5rem;
    text-align: right;
  }
  .loc-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .loc-clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    transition: all 150ms;
  }
  .loc-clear-btn:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .lfo-select {
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
  }
  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms, background 150ms;
  }
  .remove-btn:hover {
    color: var(--danger);
    background: rgba(196, 91, 74, 0.08);
  }
</style>
