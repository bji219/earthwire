<script lang="ts">
  import { monitorData } from '$lib/stores/monitor.js';
  import SignalMeter from './SignalMeter.svelte';

  let expanded = true;
  let meters: SignalMeter[] = [];

  const SOURCE_NAMES: Record<string, string> = {
    'usgs-earthquakes': 'Earthquakes',
    'iss-position': 'ISS Position',
    'ebird-activity': 'Bird Activity',
    'mbari-ocean': 'MBARI Ocean',
    'solar-wind': 'Solar Wind',
    'lfo': 'LFO'
  };

  const SOURCE_ICONS: Record<string, string> = {
    'usgs-earthquakes': '🌋',
    'iss-position': '🔭',
    'ebird-activity': '🐦',
    'mbari-ocean': '🌊',
    'solar-wind': '☀️',
    'lfo': '🎛'
  };

  function formatValue(v: number): string {
    if (Math.abs(v) >= 100) return v.toFixed(1);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(4);
  }

  function timeSince(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 1) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }

  function isRecent(ts: number): boolean {
    return Date.now() - ts < 30000;
  }

  // Push values to signal meters when monitor data updates
  $: $monitorData.forEach((ch, i) => {
    if (meters[i] && ch) {
      meters[i].pushValue(ch.normalizedValue);
    }
  });
</script>

<section class="monitor-panel">
  <button class="toggle" on:click={() => expanded = !expanded}>
    <span class="chevron" class:open={expanded}>▸</span>
    <h2 class="monitor-title">Signal Monitor</h2>
    {#if $monitorData.length > 0}
      <span class="badge">{$monitorData.filter(ch => ch && isRecent(ch.lastUpdate)).length} active</span>
    {/if}
  </button>

  {#if expanded}
    <div class="channels">
      {#if $monitorData.length === 0}
        <div class="empty">
          <p>No channels connected yet.</p>
          <p class="empty-hint">Press play to start the sequencer — data will appear here as sources send updates.</p>
        </div>
      {/if}

      {#each $monitorData as ch, i}
        {#if ch}
          <div class="channel-card">
            <div class="channel-header">
              <span class="channel-label">Ch {i}</span>
              <span class="source-name">
                {SOURCE_ICONS[ch.sourceId] ?? '?'} {SOURCE_NAMES[ch.sourceId] ?? ch.sourceId}
              </span>
              <span class="field-name">{ch.fieldId}</span>
              <span class="status-pill" class:connected={isRecent(ch.lastUpdate)} class:stale={!isRecent(ch.lastUpdate)}>
                {isRecent(ch.lastUpdate) ? 'Live' : 'Idle'}
              </span>
              {#if ch.sequencerLength != null && ch.sequencerPosition != null}
                <span class="seq-position">Step {ch.sequencerPosition + 1}/{ch.sequencerLength}</span>
              {:else}
                <span class="time">{timeSince(ch.lastUpdate)}</span>
              {/if}
            </div>

            <div class="channel-body">
              <div class="values">
                <div class="value-group">
                  <span class="vlabel">Raw</span>
                  <span class="number">{formatValue(ch.rawValue)}</span>
                </div>
                <svg class="arrow-svg" width="16" height="12" viewBox="0 0 16 12"><path d="M1,6 L12,6 M10,3 L13,6 L10,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <div class="value-group">
                  <span class="vlabel">Norm</span>
                  <span class="number highlight">{ch.normalizedValue.toFixed(3)}</span>
                </div>
                <svg class="arrow-svg" width="16" height="12" viewBox="0 0 16 12"><path d="M1,6 L12,6 M10,3 L13,6 L10,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <div class="value-group">
                  <span class="vlabel">Out</span>
                  <span class="number out-label">{ch.outputLabel}</span>
                </div>
              </div>

              <div class="meter-wrap">
                <SignalMeter bind:this={meters[i]} width={280} height={40} />
              </div>
            </div>

            {#if ch.sequencerLength != null && ch.sequencerLength > 0 && ch.sequencerPosition != null}
              <div class="seq-progress">
                <div class="seq-bar" style="width: {((ch.sequencerPosition + 1) / ch.sequencerLength) * 100}%"></div>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .monitor-panel {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }
  .toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
  }
  .toggle:hover {
    background: var(--bg-tertiary);
  }
  .chevron {
    display: inline-block;
    transition: transform 150ms;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .monitor-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 400;
    margin: 0;
    color: var(--text-primary);
  }
  .badge {
    margin-left: auto;
    background: var(--accent-bg);
    color: var(--accent);
    padding: 0.15rem 0.6rem;
    border-radius: 20px;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .channels {
    padding: 0 1.5rem 1rem;
  }
  .empty {
    text-align: center;
    padding: 1.5rem 0;
  }
  .empty p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .empty-hint {
    margin-top: 0.35rem !important;
    font-size: 0.8rem !important;
    color: var(--signal-inactive) !important;
  }
  .channel-card {
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  }
  .channel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .channel-label {
    font-family: var(--font-mono);
    color: var(--accent);
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    min-width: 2rem;
  }
  .source-name {
    font-family: var(--font-display);
    color: var(--text-primary);
    font-size: 0.95rem;
  }
  .field-name {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .status-pill {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 500;
    padding: 0.1rem 0.5rem;
    border-radius: 20px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-left: auto;
  }
  .status-pill.connected {
    background: var(--accent-bg);
    color: var(--accent);
  }
  .status-pill.stale {
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }
  .time {
    font-family: var(--font-mono);
    color: var(--text-muted);
    font-size: 0.7rem;
    min-width: 3rem;
    text-align: right;
  }
  .channel-body {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .values {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }
  .value-group {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .vlabel {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.1rem;
  }
  .number {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-primary);
    font-weight: 500;
  }
  .number.highlight {
    color: var(--accent);
    font-weight: 600;
  }
  .number.out-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .arrow-svg {
    color: var(--border);
    flex-shrink: 0;
  }
  .meter-wrap {
    flex-shrink: 0;
  }
  .seq-position {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--accent);
    min-width: 5rem;
    text-align: right;
  }
  .seq-progress {
    height: 3px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  .seq-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 80ms;
  }
</style>
