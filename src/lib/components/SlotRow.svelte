<!-- src/lib/components/SlotRow.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import WaveformTrimA from './WaveformTrimA.svelte';
  import WaveformTrimB from './WaveformTrimB.svelte';
  import { extractPeaksRange, peaksToSvgPath } from '$lib/kit/audio-processor';
  import {
    SLOT_COLORS, SLOT_NOTES, formatDuration,
    PLAY_MODE_ICON, PLAY_MODE_LABEL,
  } from '$lib/kit/types';
  import { pitchedDuration, PITCH_MIN, PITCH_MAX } from '$lib/kit/pitch';
  import { GAIN_MIN_DB, GAIN_MAX_DB } from '$lib/kit/gain';
  import { dragPayload } from '$lib/stores/drag';
  import { isUnlocked, openUnlock } from '$lib/stores/license';
  import type { SlotMeta } from '$lib/kit/types';

  export let index: number;
  export let slot: SlotMeta | null;
  export let buffer: AudioBuffer | undefined;
  export let isActive: boolean = false;
  export let isSelected: boolean = false;

  const dispatch = createEventDispatcher<{
    activate: void;
    select: void;
    clear: void;
    trim: { trimStart: number; trimEnd: number };
    preview: void;
    cyclemode: void;
    pitch: { delta: number };
    gain: { delta: number };
    resettune: void;
    fill: { index: number; name: string; sourceType: 'local' | 'freesound' | 'xeno-canto'; remoteSrc?: string; buffer: AudioBuffer };
    reorder: { fromIndex: number; toIndex: number };
  }>();

  const MINI_BARS = 32;
  const MINI_W = 70;
  const MINI_H = 22;

  $: peaks = (buffer && slot)
    ? extractPeaksRange(buffer, MINI_BARS, slot.trimStart, slot.trimEnd)
    : [];
  $: svgPath = peaksToSvgPath(peaks, MINI_W, MINI_H);
  $: color = SLOT_COLORS[index];
  $: note  = SLOT_NOTES[index];
  $: trimDuration = slot ? pitchedDuration(slot) : 0;
  const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

  $: pitchValue = slot?.pitchSemitones ?? 0;
  $: pitchLabel = signed(pitchValue);
  $: gainValue = slot?.gainDb ?? 0;
  $: gainLabel = signed(gainValue);
  $: isModified = pitchValue !== 0 || gainValue !== 0;
  // Always both values, including at their defaults. Showing them conditionally
  // resized the button and shifted the whole row as you edited.
  $: tuneSummary = `${pitchLabel}st ${gainLabel}dB`;

  let showTune = false;
  // Collapse when the sample goes away, so the strip can't outlive its slot.
  $: if (!slot && showTune) showTune = false;

  let isDragOver = false;
  let editing = false;
  let trimVariant: 'A' | 'B' = 'A';

  function toggleTrim() {
    if (!get(isUnlocked)) {
      openUnlock('trim');
      return;
    }
    editing = !editing;
  }

  // Close any open editor if Pro is deactivated mid-session.
  $: if (!$isUnlocked && editing) editing = false;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    const types = e.dataTransfer?.types ?? [];
    e.dataTransfer!.dropEffect = types.includes('application/earthwire-slot') ? 'move' : 'copy';
    isDragOver = true;
  }

  function handleDragLeave() { isDragOver = false; }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const types = e.dataTransfer?.types ?? [];
    if (types.includes('application/earthwire-slot')) {
      const fromIndex = parseInt(e.dataTransfer!.getData('application/earthwire-slot'), 10);
      if (fromIndex !== index) dispatch('reorder', { fromIndex, toIndex: index });
    } else if (types.includes('application/earthwire-sound')) {
      const payload = get(dragPayload);
      if (payload) dispatch('fill', { index, ...payload });
    }
  }

  function handleSlotDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/earthwire-slot', String(index));
  }
</script>

<div class="slot-wrap">
  <div
    class="slot-row"
    class:active={isActive}
    class:selected={isSelected}
    class:filled={!!slot}
    class:drag-over={isDragOver}
    draggable={!!slot}
    on:click={(e) => { if (e.shiftKey) { dispatch('select'); } else { dispatch('activate'); } }}
    on:dragstart={handleSlotDragStart}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <span class="slot-num">{index + 1}</span>

    <span class="slot-dot-wrap">
      {#if slot}
        <span class="dot" style="background:{color}"></span>
      {:else}
        <span class="dot dot-empty"></span>
      {/if}
    </span>

    <span class="slot-name" class:empty={!slot}>
      {slot ? slot.name : `(${note})`}
    </span>

    {#if slot && svgPath}
      <svg class="mini-wave" viewBox="0 0 {MINI_W} {MINI_H}" preserveAspectRatio="none">
        <path d={svgPath} fill={isActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'} stroke="none" />
      </svg>
    {:else}
      <span class="mini-wave"></span>
    {/if}

    {#if slot}
      <button
        class="trim-btn"
        class:open={editing}
        class:locked={!$isUnlocked}
        on:click|stopPropagation={toggleTrim}
        title={$isUnlocked ? 'Open trim editor' : 'Trimming is a Pro feature'}
      >{$isUnlocked ? '✂' : '🔒'}</button>
      <button
        class="mode-btn mode-{slot.playMode}"
        class:active={slot.playMode !== 'oneshot'}
        on:click|stopPropagation={() => dispatch('cyclemode')}
        title="Playback: {PLAY_MODE_LABEL[slot.playMode]} (click to cycle)"
        aria-label="Playback mode: {PLAY_MODE_LABEL[slot.playMode]}"
      >{PLAY_MODE_ICON[slot.playMode]}</button>

      <button
        class="tune-btn"
        class:open={showTune}
        class:set={isModified}
        on:click|stopPropagation={() => showTune = !showTune}
        title={isModified ? `Pitch ${pitchLabel} st, gain ${gainLabel} dB` : 'Pitch and gain'}
        aria-label="Pitch and gain settings"
        aria-expanded={showTune}
      ><span class="tune-text">{tuneSummary}</span><span class="tune-caret">▾</span></button>
    {/if}

    <span class="slot-dur">
      {slot ? formatDuration(trimDuration) : ''}
    </span>

    {#if slot}
      <button
        class="clear-btn"
        on:click|stopPropagation={() => dispatch('clear')}
        title="Remove sample"
      >✕</button>
    {/if}
  </div>

  {#if showTune && slot}
    <div class="tune-strip">
      {#if isModified}
        <button
          class="tune-reset"
          on:click|stopPropagation={() => dispatch('resettune')}
          title="Back to unpitched and unity gain"
        >reset</button>
      {/if}

      <span class="tune-label">pitch</span>
      <span class="tune-stepper">
        <button
          class="tune-step"
          disabled={pitchValue <= PITCH_MIN}
          on:click|stopPropagation={() => dispatch('pitch', { delta: -1 })}
          aria-label="Pitch down a semitone"
        >−</button>
        <span class="tune-val" class:set={pitchValue !== 0}>{pitchLabel}</span>
        <button
          class="tune-step"
          disabled={pitchValue >= PITCH_MAX}
          on:click|stopPropagation={() => dispatch('pitch', { delta: 1 })}
          aria-label="Pitch up a semitone"
        >+</button>
      </span>
      <span class="tune-unit">semitones</span>

      <span class="tune-label tune-label-2">gain</span>
      <span class="tune-stepper">
        <button
          class="tune-step"
          disabled={gainValue <= GAIN_MIN_DB}
          on:click|stopPropagation={() => dispatch('gain', { delta: -1 })}
          aria-label="Gain down one decibel"
        >−</button>
        <span class="tune-val" class:set={gainValue !== 0}>{gainLabel}</span>
        <button
          class="tune-step"
          disabled={gainValue >= GAIN_MAX_DB}
          on:click|stopPropagation={() => dispatch('gain', { delta: 1 })}
          aria-label="Gain up one decibel"
        >+</button>
      </span>
      <span class="tune-unit">dB</span>
    </div>
  {/if}

  {#if editing && slot && buffer}
    <div class="variant-bar">
      <span class="variant-label">variant</span>
      <button class="var-btn" class:active={trimVariant === 'A'} on:click={() => trimVariant = 'A'}>A canvas</button>
      <button class="var-btn" class:active={trimVariant === 'B'} on:click={() => trimVariant = 'B'}>B svg</button>
    </div>
    {#if trimVariant === 'A'}
      <WaveformTrimA
        {buffer}
        trimStart={slot.trimStart}
        trimEnd={slot.trimEnd}
        fullDuration={slot.fullDuration}
        on:change={e => dispatch('trim', e.detail)}
        on:preview={() => dispatch('preview')}
      />
    {:else}
      <WaveformTrimB
        {buffer}
        trimStart={slot.trimStart}
        trimEnd={slot.trimEnd}
        fullDuration={slot.fullDuration}
        on:change={e => dispatch('trim', e.detail)}
        on:preview={() => dispatch('preview')}
      />
    {/if}
  {/if}
</div>

<style>
  .slot-wrap { border-bottom: 1px solid var(--border-light, #eee); }

  .variant-bar {
    display: flex; align-items: center; gap: 0.35rem;
    padding: 0.25rem 0.75rem; background: #0d0d0d; border-bottom: 1px solid #1e1e1e;
  }
  .variant-label { font-size: 0.58rem; color: #444; text-transform: uppercase; letter-spacing: 0.06em; }
  .var-btn {
    font-size: 0.6rem; padding: 0.1rem 0.45rem;
    border: 1px solid #2a2a2a; border-radius: 3px;
    background: #1a1a1a; color: #555; cursor: pointer; font-family: var(--font-body);
  }
  .var-btn.active { border-color: #4a7c59; color: #4a7c59; background: #0f1f15; }

  .slot-row {
    display: flex; align-items: center; gap: 0;
    min-height: 32px; cursor: pointer;
    transition: background 80ms;
  }
  .slot-row:hover:not(.active):not(.selected) { background: var(--bg-secondary); }
  .slot-row.selected:not(.active) { background: var(--accent-bg); outline: 1px solid var(--accent); outline-offset: -1px; }
  .slot-row.active { background: #1a1a1a; color: #fff; }
  .slot-row.drag-over {
    outline: 2px solid var(--accent, #4a9eff);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--accent, #4a9eff) 10%, transparent);
  }

  .slot-num {
    font-size: 0.68rem; color: var(--text-muted); width: 2.2rem;
    text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-num { color: #666; }

  .slot-dot-wrap {
    width: 1rem; flex-shrink: 0;
    display: flex; justify-content: center;
  }
  .dot { width: 5px; height: 5px; border-radius: 50%; display: block; }
  .dot-empty { border: 1px solid #ccc; background: transparent; }
  .slot-row.active .dot-empty { border-color: #444; }

  .slot-name {
    flex: 1; font-size: 0.73rem; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; padding: 0 0.5rem; color: var(--text-primary);
  }
  .slot-name.empty { color: var(--text-muted); font-style: italic; }
  .slot-row.active .slot-name { color: #fff; }

  .mini-wave { width: 70px; height: 22px; flex-shrink: 0; }

  .mode-btn {
    font-size: 0.72rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.4rem; flex-shrink: 0;
    width: 1.4rem; text-align: center; line-height: 1;
    opacity: 0;
  }
  .slot-row:hover .mode-btn { opacity: 1; }
  .mode-btn.active { opacity: 1; color: var(--accent, #4a7c59); }
  .slot-row.active .mode-btn { color: #999; }
  .slot-row.active .mode-btn.active { color: #4a7c59; }
  .mode-btn.mode-reverse { color: var(--accent, #4a7c59); }

  /* Always visible, unlike the trim and mode glyphs. Those are recognisable
     icons; this one needs its label to be findable at all. */
  .tune-btn {
    display: inline-flex; align-items: center; gap: 0.15rem;
    font-family: var(--font-body); font-size: 0.58rem;
    color: var(--text-muted); background: none;
    border: 1px solid transparent; border-radius: 3px;
    cursor: pointer; padding: 0.1rem 0.3rem; flex-shrink: 0;
    line-height: 1; white-space: nowrap;
  }
  .tune-btn:hover { border-color: var(--border, #DDD8CF); color: var(--text-primary); }
  /* Fixed width sized for the widest possible pair (-24st -24dB). Mono keeps ch
     honest, so the row never reflows as values change. */
  .tune-text {
    font-family: var(--font-mono, monospace);
    min-width: 12ch; text-align: right;
  }
  .tune-caret { font-size: 0.55rem; line-height: 1; }
  .tune-btn.open,
  .tune-btn.set { color: var(--accent, #4a7c59); font-weight: 600; }
  .tune-btn.open .tune-caret { transform: rotate(180deg); }
  .slot-row.active .tune-btn { color: #999; }
  .slot-row.active .tune-btn.open,
  .slot-row.active .tune-btn.set { color: #4a7c59; }

  /* Right-aligned so the steppers land under the tune button you just clicked,
     instead of all the way across the row. */
  .tune-strip {
    display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem;
    padding: 0.4rem 1rem 0.5rem 2.6rem;
    background: var(--bg-secondary, #F0EDE6);
    border-bottom: 1px solid var(--border-light, #eee);
    font-size: 0.62rem; color: var(--text-muted);
  }
  .tune-label { font-weight: 600; color: var(--text-secondary, #6B6B6B); }
  .tune-label-2 { margin-left: 0.9rem; }
  .tune-stepper {
    display: flex; align-items: center; gap: 0.05rem;
    border: 1px solid var(--border, #DDD8CF); border-radius: 3px;
    background: var(--bg-input, #fff);
  }
  .tune-step {
    font-size: 0.7rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0.05rem 0.3rem; line-height: 1;
  }
  .tune-step:hover:not(:disabled) { color: var(--text-primary); }
  .tune-step:disabled { opacity: 0.3; cursor: not-allowed; }
  .tune-val {
    font-family: var(--font-mono, monospace); font-size: 0.6rem;
    min-width: 1.7rem; text-align: center; color: var(--text-muted);
  }
  .tune-val.set { color: var(--accent, #4a7c59); font-weight: 600; }
  .tune-unit { font-size: 0.58rem; opacity: 0.8; }
  .tune-reset {
    margin-right: auto; font-size: 0.58rem; background: none;
    border: 1px solid var(--border, #DDD8CF); border-radius: 3px;
    color: var(--text-muted); cursor: pointer; padding: 0.1rem 0.4rem;
    font-family: var(--font-body);
  }
  .tune-reset:hover { color: var(--text-primary); border-color: var(--text-muted); }

  .slot-dur {
    font-size: 0.68rem; color: var(--text-muted);
    width: 3rem; text-align: right; padding-right: 0.5rem;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .slot-row.active .slot-dur { color: #aaa; }

  .clear-btn {
    font-size: 0.58rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.5rem; flex-shrink: 0;
    opacity: 0;
  }
  .slot-row:hover .clear-btn { opacity: 1; }
  .clear-btn:hover { color: #c0392b; }

  .trim-btn {
    font-size: 0.62rem; color: var(--text-muted); background: none;
    border: none; cursor: pointer; padding: 0 0.4rem; flex-shrink: 0;
    opacity: 0;
  }
  .slot-row:hover .trim-btn { opacity: 1; }
  .trim-btn.open { opacity: 1; color: var(--accent, #4a7c59); }
  /* Faintly visible at rest — a lock nobody notices never sells anything. */
  .trim-btn.locked { opacity: 0.4; }
  .slot-row:hover .trim-btn.locked { opacity: 1; }
  .slot-row.active .trim-btn { color: #999; }
  .slot-row.active .trim-btn.open { color: #4a7c59; }

  @media (max-width: 768px) {
    .slot-row {
      min-height: 48px;
      gap: 0.25rem;
      padding: 0.25rem 0;
    }
    .slot-num {
      font-size: 0.8rem;
      width: 2rem;
      padding-right: 0.4rem;
    }
    .dot { width: 10px; height: 10px; }
    .slot-name {
      font-size: 0.9rem;
      padding: 0 0.4rem;
    }
    .mini-wave { display: none; }
    .slot-dur {
      font-size: 0.75rem;
      width: 2.6rem;
      padding-right: 0.35rem;
    }
    .clear-btn,
    .trim-btn,
    .mode-btn {
      opacity: 1;
      font-size: 0.95rem;
      padding: 0.5rem 0.65rem;
      min-width: 36px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* No hover on touch, so the toggle is always visible and tap-sized. */
    .tune-btn {
      font-size: 0.72rem;
      padding: 0.4rem 0.5rem;
      min-height: 36px;
      border-color: var(--border, #DDD8CF);
    }
    .tune-strip { font-size: 0.75rem; padding-left: 1rem; flex-wrap: wrap; justify-content: flex-start; }
    .tune-step {
      font-size: 1rem;
      min-width: 32px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tune-val { font-size: 0.8rem; min-width: 2rem; }
  }
</style>
