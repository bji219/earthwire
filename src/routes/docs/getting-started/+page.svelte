<script lang="ts">
  import { SUPPORT_URL } from '$lib/support';
  import { PLAY_MODE_CYCLE, PLAY_MODE_ICON, PLAY_MODE_LABEL } from '$lib/kit/types';
  import type { SlotPlayMode } from '$lib/kit/types';

  // Driven off PLAY_MODE_CYCLE so adding a mode to the app cannot leave the
  // docs silently listing a stale set.
  const PLAY_MODE_BLURB: Record<SlotPlayMode, string> = {
    oneshot:    'Plays the whole trimmed sample once per press, however briefly you tap the key. The default, and what you want for most drums.',
    gate:       'Plays only while you hold the key and stops the instant you let go. Good for sustained sounds you want to cut short.',
    loop:       'Repeats the trimmed region over and over for as long as the key is held. Useful for textures and sustained tones.',
    gravity:    'Bounces back and forth through the sample, forwards then backwards, while the key is held. The OP-1 calls this gravity.',
    revoneshot: 'Plays the trimmed region backwards once per press. Previewing in the browser reverses too, so you hear what you will get.',
    revgate:    'Plays backwards while you hold the key and stops on release. Reverse and gate combined.',
  };
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="docs">
  <a href="/" class="back">&larr; Back to app</a>

  <h1>Getting Started with Earthwire</h1>

  <p class="intro">
    Earthwire builds OP-1 and OP-1 Field drum kits from Freesound, Xeno-canto bird recordings, and your own audio.
    Browse, arrange 24 slots, trim, and export a <code>.aif</code> your device loads directly.
  </p>

  <section>
    <h2>Build a Kit (OP-1 / OP-1 Field)</h2>
    <ol>
      <li>Open the <strong>Kit Designer</strong> (the home page). On your first visit you'll see a landing screen. Click <strong>Build a Kit</strong> to enter.</li>
      <li>In the <strong>Sample Browser</strong> on the left, search <strong>Freesound</strong> for drum and instrument samples, or <strong>Bird Sounds</strong> (Xeno-canto) for field recordings. You can also upload your own files under <strong>My Sounds</strong>.</li>
      <li>Drag a sample onto one of the 24 slots in the <strong>Kit Builder</strong> on the right, or click a sample to preview and then drop it into the next empty slot.</li>
      <li>Click the <strong>✂ trim</strong> icon on a slot to open the waveform editor and set <strong>trimStart</strong>/<strong>trimEnd</strong> for that slot.</li>
      <li>Click <strong>tune</strong> on a slot to set its <strong>pitch</strong> and <strong>gain</strong>. Both are free and both apply to the audio itself.</li>
      <li>Pick a <strong>device mode</strong>: OP-1 (mono, 12s max) or OP-1 Field (stereo, 20s max).</li>
      <li>Click <strong>Export</strong> to download a ready-to-load <code>.aif</code> drum kit. If any slots come from Freesound, a <code>-credits.txt</code> sidecar is downloaded too.</li>
      <li>Copy the <code>.aif</code> into your OP-1 / OP-1 Field's drum folder and load it like any other kit.</li>
    </ol>
  </section>

  <section>
    <h2>Pitch and Gain</h2>
    <p>
      Every slot has a <strong>tune</strong> button, sitting just after the playback mode icon. Click
      it to open pitch and gain for that slot. Once either is set, the button shows the values
      instead, so you can see at a glance which slots you have changed.
    </p>
    <dl class="modes">
      <dt><span class="mode-icon">st</span>pitch</dt>
      <dd>
        Shifts the slot by semitones, up to two octaves either way. Previewing plays the pitched
        version, including when the slot is reversed, so what you hear is what gets exported.
      </dd>

      <dt><span class="mode-icon">dB</span>gain</dt>
      <dd>
        Sets the level from −24 to +6 dB, which is how you balance a loud kick against a quiet field
        recording. Earthwire already lifts very quiet samples automatically on export, and gain
        applies on top of that lift, so 0 dB is the level you hear when previewing. Pushing well past
        0 on an already loud sample will clip it.
      </dd>
    </dl>
    <p>
      Both are applied to the audio itself rather than saved as device settings, so they sound
      identical everywhere and leave the OP-1's own controls free for playing.
    </p>
    <p class="note">
      <strong>Pitching changes how much of your budget a slot uses.</strong> Pitch a two second
      sample down an octave and it becomes four seconds. Watch the bar above the slots. If a kit runs
      past 12s or 20s the last slots get clipped to fit, the same as when you add too many samples.
    </p>
  </section>

  <section>
    <h2>Playback Modes</h2>
    <p>
      Each slot has a playback mode, cycled with the button next to the ✂ icon. The mode is written
      into the exported kit and takes effect on the device:
    </p>
    <dl class="modes">
      {#each PLAY_MODE_CYCLE as mode}
        <dt><span class="mode-icon">{PLAY_MODE_ICON[mode]}</span>{PLAY_MODE_LABEL[mode]}</dt>
        <dd>{PLAY_MODE_BLURB[mode]}</dd>
      {/each}
    </dl>
  </section>

  <section>
    <h2>What it costs</h2>
    <p>
      Nothing. Every part of Earthwire is free and always will be: unlimited searching across
      Freesound and Xeno-canto, all 24 slots, both device modes, every playback mode, the waveform
      trim editor, pitch and gain, and as many kit exports as you like. There is no account, no
      sign-up, and nothing is stored on a server.
    </p>
    {#if SUPPORT_URL}
      <p>
        If it saved you some time and you feel like saying thanks, you can
        <a href={SUPPORT_URL} target="_blank" rel="noopener">buy me a coffee</a>.
        Entirely optional, and nothing changes either way.
      </p>
    {/if}
  </section>
</div>

<style>
  .docs {
    max-width: 660px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem;
    font-family: var(--font-body, 'DM Sans', 'Helvetica Neue', sans-serif);
    color: var(--text-primary, #2C2C2C);
    line-height: 1.7;
    background: var(--bg-primary, #FAFAF7);
    width: 100%;
  }
  .back {
    color: var(--accent, #1A6B5A);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .back:hover {
    text-decoration: underline;
  }
  h1 {
    font-family: var(--font-display, 'DM Serif Display', Georgia, serif);
    margin-top: 1rem;
    color: var(--text-primary, #2C2C2C);
    font-weight: 400;
    font-size: 2rem;
    letter-spacing: -0.01em;
  }
  .intro {
    color: var(--text-secondary, #6B6B6B);
    font-size: 1.05rem;
    margin-bottom: 2rem;
  }
  h2 {
    font-family: var(--font-display, 'DM Serif Display', Georgia, serif);
    color: var(--accent, #1A6B5A);
    margin-top: 2.5rem;
    font-weight: 400;
    font-size: 1.35rem;
  }
  ol {
    padding-left: 1.5rem;
  }
  li {
    margin-bottom: 0.5rem;
    color: var(--text-primary, #2C2C2C);
  }
  code {
    font-family: var(--font-mono, 'JetBrains Mono', 'SF Mono', monospace);
    font-size: 0.85em;
    background: var(--bg-tertiary, #E8E4DC);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  dl {
    margin: 0;
  }
  dt {
    font-weight: 600;
    color: var(--text-primary, #2C2C2C);
    margin-top: 1rem;
  }
  dd {
    margin-left: 0;
    color: var(--text-secondary, #6B6B6B);
  }

  .modes dt {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .mode-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    flex-shrink: 0;
    border: 1px solid var(--border, #DDD8CF);
    border-radius: 4px;
    background: var(--bg-secondary, #F0EDE6);
    color: var(--accent, #1A6B5A);
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    line-height: 1;
  }
  .modes dd {
    margin-left: 2.2rem;
  }
  .note {
    color: var(--text-muted, #9B9B9B);
    font-size: 0.85rem;
    margin-top: 0.75rem;
  }
  strong {
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .docs { padding: 1.5rem 1rem; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    .intro { font-size: 1rem; }
    ol { padding-left: 1.25rem; }
    li { font-size: 0.95rem; }
  }
</style>
