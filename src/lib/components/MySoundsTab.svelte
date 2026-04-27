<!-- src/lib/components/MySoundsTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { loadSounds, saveSound, deleteSound, type LocalSound } from '$lib/stores/my-sounds';
  import { formatDuration } from '$lib/kit/types';

  const dispatch = createEventDispatcher<{ add: { sound: LocalSound; buffer: AudioBuffer } }>();

  let sounds: LocalSound[] = [];
  let dragging = false;
  let audioCtx: AudioContext | null = null;

  onMount(async () => { sounds = await loadSounds(); });

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const sound: LocalSound = {
        id: crypto.randomUUID(),
        name: file.name,
        duration: audioBuffer.duration,
        data: arrayBuffer,
      };
      await saveSound(sound);
      sounds = [...sounds, sound];
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    if (e.dataTransfer?.files) await addFiles(e.dataTransfer.files);
  }

  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) await addFiles(input.files);
  }

  async function playSound(sound: LocalSound) {
    const ctx = getCtx();
    const buf = await ctx.decodeAudioData(sound.data.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
  }

  async function addToKit(sound: LocalSound) {
    const ctx = getCtx();
    const buffer = await ctx.decodeAudioData(sound.data.slice(0));
    dispatch('add', { sound, buffer });
  }

  async function remove(sound: LocalSound) {
    await deleteSound(sound.id);
    sounds = sounds.filter(s => s.id !== sound.id);
  }
</script>

<div class="my-sounds">
  <label
    class="drop-zone"
    class:dragging
    on:dragover|preventDefault={() => dragging = true}
    on:dragleave={() => dragging = false}
    on:drop={handleDrop}
  >
    <input type="file" accept="audio/*" multiple on:change={handleFileInput} style="display:none">
    <div class="drop-icon">📂</div>
    <div>drag and drop audio files here</div>
    <div class="drop-sub">or click to browse · mp3, wav, aiff, flac, ogg</div>
  </label>

  {#if sounds.length > 0}
    <div class="section-label">my library · {sounds.length} files</div>
    {#each sounds as sound}
      <div class="result-item">
        <button class="play-btn" on:click={() => playSound(sound)}>▶</button>
        <div class="result-info">
          <div class="result-name">{sound.name}</div>
          <div class="result-meta">local · {formatDuration(sound.duration)}</div>
        </div>
        <span class="result-dur">{formatDuration(sound.duration)}</span>
        <button class="add-btn" on:click={() => addToKit(sound)}>+ Add</button>
        <button class="del-btn" on:click={() => remove(sound)} title="Remove from library">✕</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .my-sounds { height: 100%; overflow-y: auto; }
  .drop-zone {
    display: block; margin: 1rem; border: 2px dashed var(--border);
    border-radius: 6px; padding: 1.5rem 1rem; text-align: center;
    color: var(--text-muted); font-size: 0.8rem; cursor: pointer;
    transition: border-color 150ms;
  }
  .drop-zone:hover, .drop-zone.dragging { border-color: var(--accent); color: var(--accent); }
  .drop-icon { font-size: 1.6rem; margin-bottom: 0.4rem; }
  .drop-sub { font-size: 0.67rem; color: var(--text-muted); margin-top: 0.3rem; }
  .section-label {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em;
    color: var(--text-muted); text-transform: uppercase; padding: 0.5rem 1rem 0.25rem;
  }
  .result-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-light, #eee);
  }
  .result-item:hover { background: var(--bg-secondary); }
  .play-btn {
    width: 20px; height: 20px; border-radius: 50%; background: var(--text-primary);
    color: var(--bg-primary, #fff); border: none; cursor: pointer; font-size: 0.55rem;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 0.77rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { font-size: 0.67rem; color: var(--text-muted); }
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }
  .del-btn {
    font-size: 0.65rem; background: none; border: none; cursor: pointer;
    color: var(--text-muted); flex-shrink: 0;
  }
  .del-btn:hover { color: #c0392b; }
</style>
