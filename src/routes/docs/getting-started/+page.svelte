<script lang="ts">
  import { FREE_EXPORT_LIMIT, FREE_UPLOAD_LIMIT, ETSY_LISTING_URL } from '$lib/license/limits';
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
      <li>Click the <strong>✂ trim</strong> icon on a slot to open the waveform editor and set <strong>trimStart</strong>/<strong>trimEnd</strong> for that slot. This is a Pro feature — see below.</li>
      <li>Pick a <strong>device mode</strong>: OP-1 (mono, 12s max) or OP-1 Field (stereo, 20s max).</li>
      <li>Click <strong>Export</strong> to download a ready-to-load <code>.aif</code> drum kit. If any slots come from Freesound, a <code>-credits.txt</code> sidecar is downloaded too.</li>
      <li>Copy the <code>.aif</code> into your OP-1 / OP-1 Field's drum folder and load it like any other kit.</li>
    </ol>
  </section>

  <section>
    <h2>Playback Modes</h2>
    <p>
      Each slot has a playback mode, cycled with the button next to the ✂ icon. The mode is written
      into the exported kit and takes effect on the device:
    </p>
    <dl>
      <dt>One-shot</dt>
      <dd>Plays the whole trimmed sample once per press. The default, and what you want for most drums.</dd>

      <dt>Loop</dt>
      <dd>Repeats the trimmed region for as long as the key is held.</dd>

      <dt>Gate</dt>
      <dd>Plays while the key is held and stops the moment you release it.</dd>

      <dt>Reverse</dt>
      <dd>Plays the trimmed region backwards. Previewing in the browser reverses too, so you hear what you'll get.</dd>
    </dl>
  </section>

  <section>
    <h2>Free and Pro</h2>
    <p>
      Everything you need to try Earthwire is free: unlimited searching across Freesound and Xeno-canto,
      all 24 slots, both device modes, every playback mode, and one kit export so you can confirm it
      loads on your actual hardware.
    </p>
    <dl>
      <dt>Kit exports</dt>
      <dd>Free: {FREE_EXPORT_LIMIT === 1 ? 'one export' : `${FREE_EXPORT_LIMIT} exports`}. Pro: unlimited.</dd>

      <dt>Waveform trim editor</dt>
      <dd>
        Free: locked. Samples export at full length, and once the kit exceeds your device's budget
        (12s on OP-1, 20s on OP-1 Field) the last slots get clipped. Pro: full ✂ editor with zoom,
        so every slot is exactly as long as you want it.
      </dd>

      <dt>My Sounds uploads</dt>
      <dd>Free: up to {FREE_UPLOAD_LIMIT} of your own files. Pro: unlimited.</dd>
    </dl>
  </section>

  <section>
    <h2>Unlocking Pro</h2>
    <ol>
      <li>Buy the <strong>Earthwire Pro key</strong> on <a href={ETSY_LISTING_URL} target="_blank" rel="noopener">Etsy</a>. It's an instant download, so the PDF with your key arrives as soon as the order goes through.</li>
      <li>Open the PDF and copy the key. It looks like <code>EW-B01-7KQ4M-9XTPZ-A3F8</code>.</li>
      <li>Click <strong>Unlock Pro</strong> in the top bar, paste the key, and press <strong>Unlock</strong>.</li>
      <li>The chip changes to <strong>Pro ✓</strong> and every limit lifts immediately.</li>
    </ol>
    <p class="note">
      Your key is stored in this browser only. Unlocking on another browser, another machine, or after
      clearing site data just means pasting the same key again, so keep the PDF. Keys don't expire.
    </p>
    <p class="tip">
      Trouble with a key? Message me through Etsy and include your order number.
    </p>
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
    min-height: 100vh;
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
  .tip {
    color: var(--accent, #1A6B5A);
    background: var(--accent-bg, #E8F5F0);
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    margin-top: 1rem;
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
