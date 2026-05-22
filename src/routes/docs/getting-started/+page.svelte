<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="docs">
  <a href="/" class="back">&larr; Back to app</a>

  <h1>Getting Started with Earthwire</h1>

  <p class="intro">
    Earthwire builds OP-1 and OP-1 Field drum kits from Freesound, Xeno-canto bird recordings, and your own audio —
    and also streams live scientific data (earthquakes, ISS, ocean sensors, solar wind, bird activity) into MIDI signals for your DAW.
  </p>

  <section>
    <h2>Build a Kit (OP-1 / OP-1 Field)</h2>
    <ol>
      <li>Open the <strong>Kit Designer</strong> (the home page). On your first visit you'll see a landing screen — click <strong>Build a Kit</strong> to enter.</li>
      <li>In the <strong>Sample Browser</strong> on the left, search <strong>Freesound</strong> for drum and instrument samples, or <strong>Bird Sounds</strong> (Xeno-canto) for field recordings. You can also upload your own files under <strong>My Sounds</strong>.</li>
      <li>Drag a sample onto one of the 24 slots in the <strong>Kit Builder</strong> on the right, or click a sample to preview and then drop it into the next empty slot.</li>
      <li>Click the <strong>✂ trim</strong> icon on a slot to open the waveform editor and set <strong>trimStart</strong>/<strong>trimEnd</strong> for that slot.</li>
      <li>Pick a <strong>device mode</strong> — OP-1 (mono, 12s max) or OP-1 Field (stereo, 20s max).</li>
      <li>Click <strong>Export</strong> to download a ready-to-load <code>.aif</code> drum kit. If any slots come from Freesound, a <code>-credits.txt</code> sidecar is downloaded too.</li>
      <li>Copy the <code>.aif</code> into your OP-1 / OP-1 Field's drum folder and load it like any other kit.</li>
    </ol>
  </section>

  <section>
    <h2>Stream Live Data → MIDI (Sequencer)</h2>
    <ol>
      <li>Open the <strong>Sequencer</strong> from the top nav (or go to <code>/sequencer</code>). On your first visit, click <strong>Start Listening</strong> to initialize the audio engine.</li>
      <li>Press <strong>Play</strong> in the transport bar to start the sequencer. The demo synth will activate if any channel is routed to it.</li>
      <li>Use the <strong>source dropdown</strong> on a channel strip to switch between data sources (Earthquakes, ISS Position, Bird Activity, MBARI Ocean, Solar Wind). Click the <strong>info icon</strong> next to the source to visit the data provider's website.</li>
      <li>Choose a <strong>field</strong> — each source exposes different data dimensions (magnitude, depth, temperature, etc.).</li>
      <li>Select a <strong>time range</strong> (1 Hour, 1 Day, 1 Week, 1 Month) to control how much historical data the sequencer steps through.</li>
      <li>Adjust <strong>BPM</strong>, <strong>subdivision</strong> (1/4 through 1/32, including triplets), and <strong>swing %</strong> to control playback timing.</li>
      <li>Tune <strong>Norm</strong> (auto/manual) and <strong>Smooth</strong> to shape how raw data maps to the 0–1 output range.</li>
      <li>Set the <strong>output target</strong> — Demo Synth to hear it immediately, or MIDI CC/Note/Trigger to send to your DAW.</li>
      <li>Click <strong>+ Add Channel</strong> to map multiple data streams simultaneously.</li>
    </ol>
  </section>

  <section>
    <h2>MIDI Setup</h2>
    <ol>
      <li>Use <strong>Chrome</strong>, <strong>Arc</strong>, <strong>Edge</strong>, or <strong>Brave</strong> — browsers that support the Web MIDI API.</li>
      <li>Connect a virtual MIDI port (see IAC Driver setup below) or a hardware MIDI interface.</li>
      <li>Select your MIDI output port in the <strong>MIDI Out</strong> dropdown in the top bar.</li>
      <li>Set a channel's output to <strong>MIDI CC</strong>, <strong>MIDI Note</strong>, or <strong>MIDI Trigger</strong>.</li>
      <li>In your DAW, set the corresponding track's MIDI input to the virtual MIDI port.</li>
    </ol>
  </section>

  <section>
    <h2>IAC Driver Setup (macOS + Logic Pro)</h2>
    <p>
      Using Chrome's built-in MIDI output directly can cause confusing port names in Logic Pro
      (e.g., "MIDI Out" instead of a clear input label). The recommended approach is to use
      macOS's <strong>IAC Driver</strong> as a virtual MIDI bus:
    </p>
    <ol>
      <li>Open <strong>Audio MIDI Setup</strong> (search in Spotlight or find in <code>/Applications/Utilities/</code>).</li>
      <li>If you don't see the MIDI Studio window, go to <strong>Window → Show MIDI Studio</strong>.</li>
      <li>Double-click the <strong>IAC Driver</strong> icon.</li>
      <li>Check <strong>"Device is online"</strong> to enable it.</li>
      <li>Click the <strong>+</strong> button under Ports to add a new bus. Name it something clear like <strong>"Earthwire"</strong>.</li>
      <li>Click <strong>Apply</strong> and close Audio MIDI Setup.</li>
      <li>In Earthwire, select <strong>"Earthwire"</strong> (or "IAC Driver Bus") from the MIDI Out dropdown.</li>
      <li>In Logic Pro, on your software instrument track, set the MIDI input to <strong>"Earthwire"</strong> (under the IAC Driver section).</li>
    </ol>
    <p class="tip">
      This gives you a clean, named MIDI bus that shows up correctly in Logic Pro and works
      reliably across sessions. You can create multiple buses for different channel routings.
    </p>
    <p class="note">
      <strong>Windows:</strong> Use <a href="https://www.tobias-erichsen.de/software/loopmidi.html" target="_blank" rel="noopener">loopMIDI</a>
      to create virtual MIDI ports. The setup is similar — create a named port, select it in Earthwire, and set it as the input in your DAW.
    </p>
  </section>

  <section>
    <h2>Data Sources</h2>
    <dl>
      <dt>Earthquakes (USGS)</dt>
      <dd>Historical earthquake data — magnitude, depth, latitude, longitude. Fetched from the USGS GeoJSON feed.</dd>

      <dt>ISS Position</dt>
      <dd>International Space Station orbital data — latitude, longitude, altitude, velocity. Computed from TLE orbital elements.</dd>

      <dt>Bird Activity (eBird)</dt>
      <dd>Individual bird observations from the Cornell Lab eBird API — individual counts, cumulative species diversity, and latitude per observation.</dd>

      <dt>MBARI Ocean</dt>
      <dd>Oceanographic data from Monterey Bay sensors — depth profiles for temperature, salinity, and oxygen, plus chlorophyll, fluorescence, and nitrate measurements. Data from the MBARI STOQS database.</dd>

      <dt>Solar Wind (NOAA/NASA)</dt>
      <dd>Real-time solar wind plasma data — wind speed, plasma density, plasma temperature from NOAA SWPC, plus solar flare intensity from NASA DONKI. Data updates every few minutes with 7-day history.</dd>
    </dl>
  </section>

  <section>
    <h2>Location Filtering</h2>
    <p>
      Some sources support geographic filtering to focus on data near you:
    </p>
    <dl>
      <dt>Earthquakes (USGS)</dt>
      <dd>Click the <strong>crosshair icon</strong> to use your browser location, then adjust the <strong>radius slider</strong> (50–2000 km) to filter earthquakes near you. Uses the USGS FDSNWS query API.</dd>

      <dt>Bird Activity (eBird)</dt>
      <dd>Select a <strong>region</strong> from the dropdown (US states, countries) to see bird observations from that area.</dd>
    </dl>
  </section>

  <section>
    <h2>Signal Monitor</h2>
    <p>
      The <strong>Signal Monitor</strong> panel (above the channel strips) shows real-time data flow for each channel:
      raw values from the source, normalized output, and a scrolling waveform visualization.
      Use it to verify your data is streaming and to tune normalization and smoothing settings.
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
  .note a {
    color: var(--accent, #1A6B5A);
  }
  strong {
    font-weight: 600;
  }
</style>
