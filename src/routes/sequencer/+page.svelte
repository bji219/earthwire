<script lang="ts">
  import TopBar from '$lib/components/TopBar.svelte';
  import ChannelStrip from '$lib/components/ChannelStrip.svelte';
  import DemoSynthControls from '$lib/components/DemoSynthControls.svelte';
  import DataMonitor from '$lib/components/DataMonitor.svelte';
  import LandingHero from '$lib/components/LandingHero.svelte';
  import { patch } from '$lib/stores/patch.js';
  import { monitorData } from '$lib/stores/monitor.js';
  import { isPlaying, subdivision, swing } from '$lib/stores/clock.js';
  import { DemoSynth } from '$lib/outputs/demo-synth.js';
  import { MidiOutput } from '$lib/outputs/midi.js';
  import { CvOutput } from '$lib/outputs/cv-output.js';
  import { createDefaultRegistry } from '$lib/sources/index.js';
  import { EarthwireEngine } from '$lib/engine/engine.js';
  import { BpmClock } from '$lib/engine/clock.js';
  import { ChannelWiringManager } from '$lib/engine/channel-wiring.js';
  import { SequencerTransport } from '$lib/engine/sequencer-transport.js';
  import { SequencerSource } from '$lib/sources/sequencer-source.js';
  import type { ChannelConfig } from '$lib/engine/types.js';
  import { selectedPortId } from '$lib/stores/midi.js';
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { log } from '$lib/util/logger.js';

  const SEEN_KEY = 'earthwire.seen.sequencer';
  let started = false;

  onMount(() => {
    if (browser && localStorage.getItem(SEEN_KEY) === '1') {
      handleStart();
    }
  });
  let synth: DemoSynth | null = null;
  let engine: EarthwireEngine | null = null;
  let wiring: ChannelWiringManager | null = null;
  let transport: SequencerTransport | null = null;
  let midi: MidiOutput | null = null;
  let cv: CvOutput | null = null;
  let clock: BpmClock | null = null;
  const registry = createDefaultRegistry();

  function formatOutputLabel(config: ChannelConfig): string {
    const out = config.output;
    if (out.type === 'demo-synth') return `synth / ${out.param}`;
    if (out.type === 'midi-cc') return `MIDI CC ${out.cc} ch${out.channel}`;
    if (out.type === 'midi-note') return `MIDI Note ch${out.channel}`;
    if (out.type === 'midi-trigger') return `MIDI Trig ch${out.channel}`;
    if (out.type === 'cv') return `CV ch${out.audioChannel + 1}`;
    return out.type;
  }

  async function handleStart() {
    synth = new DemoSynth();
    await synth.init();

    engine = new EarthwireEngine();
    clock = new BpmClock($patch.bpm);

    // Try to init MIDI (non-blocking)
    midi = new MidiOutput();
    midi.init().catch(() => { midi = null; });

    // Try to init CV output (non-blocking)
    cv = new CvOutput();
    cv.init().catch(() => { cv = null; });

    // Create sequencer transport
    transport = new SequencerTransport(clock);

    // Create wiring manager with signal monitoring and transport registration
    wiring = new ChannelWiringManager(
      registry, engine, synth, midi, cv,
      // onSignal
      (index, rawValue, output, config) => {
        // Get sequencer state for position info
        const source = registry.getSource(config.sourceId);
        const seqState = source instanceof SequencerSource ? source.getState() : null;

        monitorData.update(data => {
          const copy = [...data];
          copy[index] = {
            sourceId: config.sourceId,
            fieldId: config.fieldId,
            connected: true,
            rawValue,
            normalizedValue: output.continuous,
            lastUpdate: Date.now(),
            outputLabel: formatOutputLabel(config),
            sequencerPosition: seqState?.cursor,
            sequencerLength: seqState?.bufferLength
          };
          return copy;
        });
      },
      // onSourceAcquired
      undefined,
      // onSourceReleased
      (sourceId) => {
        const source = registry.getSource(sourceId);
        if (source instanceof SequencerSource) {
          transport?.unregisterSource(source);
        }
      },
      // getSelectedMidiPort
      () => get(selectedPortId) ?? '',
      // transport (for tick rate management)
      transport
    );

    // Load default patch: earthquakes → demo synth filter
    const defaultChannel: ChannelConfig = {
      sourceId: 'usgs-earthquakes',
      fieldId: 'magnitude',
      timeRange: 'day',
      normalizer: { mode: 'auto' },

      smoother: { amount: 0.3 },
      quantizer: null,
      threshold: null,
      output: { type: 'demo-synth', param: 'filter-cutoff' }
    };
    if (get(patch).channels.length === 0) {
      patch.addChannel(defaultChannel);
    }

    if (browser) localStorage.setItem(SEEN_KEY, '1');
    // Set started = true so the reactive block fires syncChannels once.
    // Do NOT call syncChannels here — the reactive block handles it.
    // Calling it both here and reactively causes a race where the first
    // connectWire goes stale before it completes.
    started = true;
  }

  function addChannel() {
    const newChannel: ChannelConfig = {
      sourceId: 'usgs-earthquakes',
      fieldId: 'magnitude',
      timeRange: 'day',
      normalizer: { mode: 'auto' },

      smoother: { amount: 0.3 },
      quantizer: null,
      threshold: null,
      output: { type: 'midi-cc', channel: 1, cc: 1 }
    };
    patch.addChannel(newChannel);
  }

  // Reactively sync wiring when patch changes
  $: if (wiring && started) {
    wiring.syncChannels($patch.channels);
    // Trim monitor data to match channel count (cleans up removed channels)
    monitorData.update(data => data.slice(0, $patch.channels.length));
  }

  // Reactively sync BPM
  $: if (clock) {
    clock.bpm = $patch.bpm;
  }

  function handleStopButton() {
    log.transport('stop button pressed');
    transport?.stop();
    wiring?.panic();
    // Don't set $isPlaying here — TopBar already set it to false
  }

  let synthPlaying = false;

  // Reactively sync transport play/pause and gate synth (merged block)
  $: if (transport && started) {
    const playing = $isPlaying;
    const wantSynth = $patch.channels.some(ch => ch.output.type === 'demo-synth');
    try {
      log.transport(`reactive: playing=${playing} wantSynth=${wantSynth}`);
      wiring?.setPlaying(playing);
      if (playing) {
        transport.play();
        if (wantSynth) { synth?.start(); synthPlaying = true; }
        else { synth?.stop(); synthPlaying = false; }
      } else {
        synth?.stop();
        synthPlaying = false;
        transport.pause();
      }
    } catch (e) {
      console.error('[Earthwire] reactive block error:', e);
    }
  }

  // Reactively sync subdivision and swing
  $: if (transport) {
    transport.setSubdivision($subdivision);
  }
  $: if (transport) {
    transport.setSwing($swing);
  }

  onDestroy(() => {
    wiring?.panic();
    transport?.destroy();
    wiring?.destroy();
    synth?.destroy();
    cv?.destroy();
  });
</script>


{#if !started}
  <LandingHero
    overline="Scientific Data → Sound"
    tagline="Stream live data from the planet into your music."
    description="Earthquakes, the ISS, bird activity, ocean sensors, and solar wind — translated into MIDI CC, notes, and triggers for your DAW, synth, or modular rig."
    primaryLabel="Start Listening"
    secondaryLabel="← Build a Kit"
    secondaryHref="/"
    showMidiNote={true}
    on:start={handleStart}
  />
{:else}
  <div class="app">
    <TopBar on:stop={handleStopButton} />

    <DataMonitor />

    <main class="channels">
      <h2 class="section-heading">Channels</h2>
      {#each $patch.channels as channel, i (i)}
        <ChannelStrip {channel} index={i} />
      {/each}

      <button class="add-channel" on:click={addChannel}>+ Add Channel</button>
    </main>

    <DemoSynthControls {synth} active={synthPlaying} on:togglemute={() => {
      if (synthPlaying) { synth?.stop(); synthPlaying = false; }
      else { synth?.start(); synthPlaying = true; }
    }} />

    <div class="daw-banner">
      Connect to your DAW for the full experience &mdash;
      <a href="/docs/getting-started" target="_blank">Setup Guide</a>
    </div>
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .channels {
    flex: 1;
    padding: 0 1.5rem 1.5rem;
  }
  .section-heading {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--text-secondary);
    margin: 1.25rem 0 0.75rem;
    letter-spacing: 0.01em;
  }
  .add-channel {
    width: 100%;
    padding: 0.875rem;
    background: var(--bg-input);
    border: 2px dashed var(--border);
    border-radius: 8px;
    color: var(--accent);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, border-color 150ms;
    margin-top: 0.5rem;
  }
  .add-channel:hover {
    background: var(--accent-bg);
    border-color: var(--accent-light);
  }
  .daw-banner {
    text-align: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .daw-banner a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 500;
  }
  .daw-banner a:hover {
    text-decoration: underline;
  }
</style>
