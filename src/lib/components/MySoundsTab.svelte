<!-- src/lib/components/MySoundsTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { loadSounds, saveSound, deleteSound, type LocalSound } from '$lib/stores/my-sounds';
  import { formatDuration } from '$lib/kit/types';
  import { extractPeaks, peaksToSvgPath, decodeAudioData } from '$lib/kit/audio-processor';
  import { dragPayload } from '$lib/stores/drag';
  import { audioPlayer } from '$lib/stores/audio-player';

  const dispatch = createEventDispatcher<{ add: { sound: LocalSound; buffer: AudioBuffer } }>();

  const MINI_W = 70, MINI_H = 22, MINI_BARS = 32;

  let sounds: LocalSound[] = [];
  let dragging = false;
  let decodeCtx: AudioContext | null = null; // used only for decoding, not playback

  // Caches — persist for component lifetime
  const decodedBuffers = new Map<string, AudioBuffer>();
  let waveformPaths = new Map<string, string>();

  onMount(async () => {
    sounds = await loadSounds();
    for (const sound of sounds) {
      getOrDecodeBuffer(sound); // fire-and-forget; waveforms appear progressively
    }
  });

  function getDecodeCtx() {
    if (!decodeCtx || decodeCtx.state === 'closed') decodeCtx = new AudioContext();
    return decodeCtx;
  }

  async function getOrDecodeBuffer(sound: LocalSound): Promise<AudioBuffer> {
    if (decodedBuffers.has(sound.id)) return decodedBuffers.get(sound.id)!;
    const ctx = getDecodeCtx();
    const buf = await decodeAudioData(sound.data, ctx);
    decodedBuffers.set(sound.id, buf);
    waveformPaths.set(sound.id, peaksToSvgPath(extractPeaks(buf, MINI_BARS), MINI_W, MINI_H));
    waveformPaths = waveformPaths; // trigger Svelte reactivity
    return buf;
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getDecodeCtx();
      const audioBuffer = await decodeAudioData(arrayBuffer, ctx);
      const sound: LocalSound = {
        id: crypto.randomUUID(),
        name: file.name,
        duration: audioBuffer.duration,
        data: arrayBuffer,
      };
      await saveSound(sound);
      decodedBuffers.set(sound.id, audioBuffer);
      waveformPaths.set(sound.id, peaksToSvgPath(extractPeaks(audioBuffer, MINI_BARS), MINI_W, MINI_H));
      waveformPaths = waveformPaths;
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

  function playToggle(sound: LocalSound) {
    if ($audioPlayer.playingKey === sound.id || $audioPlayer.loadingKey === sound.id) {
      audioPlayer.stop();
    } else {
      audioPlayer.play(sound.id, () => getOrDecodeBuffer(sound));
    }
  }

  async function addToKit(sound: LocalSound) {
    const buffer = await getOrDecodeBuffer(sound);
    dispatch('add', { sound, buffer });
  }

  async function remove(sound: LocalSound) {
    await deleteSound(sound.id);
    decodedBuffers.delete(sound.id);
    waveformPaths.delete(sound.id);
    waveformPaths = waveformPaths;
    sounds = sounds.filter(s => s.id !== sound.id);
  }

  function handleDragStart(e: DragEvent, sound: LocalSound) {
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('application/earthwire-sound', sound.id);
    if (decodedBuffers.has(sound.id)) {
      dragPayload.set({ name: sound.name, sourceType: 'local', buffer: decodedBuffers.get(sound.id)! });
    } else {
      getOrDecodeBuffer(sound).then(buf =>
        dragPayload.set({ name: sound.name, sourceType: 'local', buffer: buf })
      );
    }
  }

  function handleDragEnd() {
    dragPayload.set(null);
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
    <input type="file" accept="audio/*,.aif,.aiff,.wav,.mp3,.flac,.ogg,.m4a" multiple on:change={handleFileInput} style="display:none">
    <div class="drop-icon">📂</div>
    <div>drag and drop audio files here</div>
    <div class="drop-sub">or click to browse · mp3, wav, aiff, flac, ogg</div>
  </label>

  {#if sounds.length > 0}
    <div class="section-label">my library · {sounds.length} files</div>
    {#each sounds as sound}
      <div
        class="result-item"
        draggable="true"
        on:click={() => playToggle(sound)}
        on:dragstart={e => handleDragStart(e, sound)}
        on:dragend={handleDragEnd}
      >
        <button
          class="play-btn"
          class:playing={$audioPlayer.playingKey === sound.id}
          class:loading={$audioPlayer.loadingKey === sound.id}
          on:click|stopPropagation={() => playToggle(sound)}
        >
          {$audioPlayer.loadingKey === sound.id ? '…' : $audioPlayer.playingKey === sound.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{sound.name}</div>
          <div class="result-meta">local · {formatDuration(sound.duration)}</div>
        </div>
        {#if waveformPaths.has(sound.id)}
          <svg class="mini-wave" viewBox="0 0 {MINI_W} {MINI_H}" preserveAspectRatio="none">
            <path d={waveformPaths.get(sound.id)} fill="#888" stroke="none" />
          </svg>
        {:else}
          <span class="mini-wave"></span>
        {/if}
        <span class="result-dur">{formatDuration(sound.duration)}</span>
        <button class="add-btn" on:click|stopPropagation={() => addToKit(sound)}>+ Add</button>
        <button class="del-btn" on:click|stopPropagation={() => remove(sound)} title="Remove from library">✕</button>
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
    cursor: grab;
  }
  .result-item:active { cursor: grabbing; }
  .result-item:hover { background: var(--bg-secondary); }
  .play-btn {
    width: 20px; height: 20px; border-radius: 50%; background: var(--text-primary);
    color: var(--bg-primary, #fff); border: none; cursor: pointer; font-size: 0.55rem;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .play-btn.playing, .play-btn.loading { background: var(--accent, #4a9eff); }
  .result-info { flex: 1; min-width: 0; }
  .result-name { font-size: 0.77rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { font-size: 0.67rem; color: var(--text-muted); }
  .mini-wave { width: 70px; height: 22px; flex-shrink: 0; }
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
