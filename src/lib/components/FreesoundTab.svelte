<!-- src/lib/components/FreesoundTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatDuration } from '$lib/kit/types';
  import { audioPlayer } from '$lib/stores/audio-player';
  import { dragPayload } from '$lib/stores/drag';

  const dispatch = createEventDispatcher<{ add: { name: string; previewUrl: string; buffer: AudioBuffer } }>();

  let query = '';
  let maxDuration = '';
  let cc0Only = false;
  let results: any[] = [];
  let loading = false;
  let error = '';

  const cache = new Map<number, AudioBuffer>();

  function getAudioUrl(result: any): string {
    const cdnUrl = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'] ?? '';
    return `/api/freesound?action=download&url=${encodeURIComponent(cdnUrl)}`;
  }

  async function fetchAndDecode(result: any, ctx: AudioContext): Promise<AudioBuffer> {
    if (cache.has(result.id)) return cache.get(result.id)!;
    const res = await fetch(getAudioUrl(result));
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    cache.set(result.id, buf);
    return buf;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = [];
    try {
      const params = new URLSearchParams({ action: 'search', q: query });
      if (maxDuration) params.set('max_duration', maxDuration);
      if (cc0Only) params.set('cc0', '1');
      const res = await fetch(`/api/freesound?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${res.status}`);
      }
      const data = await res.json();
      results = data.results ?? [];
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  function playToggle(result: any) {
    const key = String(result.id);
    if ($audioPlayer.playingKey === key || $audioPlayer.loadingKey === key) {
      audioPlayer.stop();
    } else {
      audioPlayer.play(key, ctx => fetchAndDecode(result, ctx));
    }
  }

  async function addToKit(result: any) {
    const ctx = audioPlayer.getCtx();
    const buffer = await fetchAndDecode(result, ctx);
    dispatch('add', { name: result.name, previewUrl: result.url, buffer });
  }

  function handleDragStart(e: DragEvent, result: any) {
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('application/earthwire-sound', String(result.id));
    if (cache.has(result.id)) {
      dragPayload.set({ name: result.name, sourceType: 'freesound', remoteSrc: result.url, buffer: cache.get(result.id)! });
    } else {
      fetchAndDecode(result, audioPlayer.getCtx()).then(buf =>
        dragPayload.set({ name: result.name, sourceType: 'freesound', remoteSrc: result.url, buffer: buf })
      );
    }
  }
</script>

<div class="freesound-tab">
  <div class="search-bar">
    <input bind:value={query} placeholder="Search Freesound…" on:keydown={e => e.key === 'Enter' && search()} />
    <select bind:value={maxDuration}>
      <option value="">Any length</option>
      <option value="10">Under 10s</option>
      <option value="30">Under 30s</option>
    </select>
    <label class="cc0-toggle">
      <input type="checkbox" bind:checked={cc0Only}> CC0
    </label>
    <button on:click={search} disabled={loading}>{loading ? '…' : 'Search'}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if results.length > 0}
    <div class="section-label">{results.length} results · Freesound</div>
    <div class="results-list">
      {#each results as result}
        {@const key = String(result.id)}
        <div
          class="result-item"
          draggable="true"
          on:click={() => playToggle(result)}
          on:dragstart={e => handleDragStart(e, result)}
          on:dragend={() => dragPayload.set(null)}
        >
          <button
            class="play-btn"
            class:playing={$audioPlayer.playingKey === key}
            class:loading={$audioPlayer.loadingKey === key}
            on:click|stopPropagation={() => playToggle(result)}
          >
            {$audioPlayer.loadingKey === key ? '…' : $audioPlayer.playingKey === key ? '■' : '▶'}
          </button>
          <div class="result-info">
            <div class="result-name">{result.name}</div>
            <div class="result-meta">{result.username} · {result.license?.includes('0') ? 'CC0' : 'CC'}</div>
          </div>
          <span class="result-dur">{formatDuration(result.duration)}</span>
          <button class="add-btn" on:click|stopPropagation={() => addToKit(result)}>+ Add</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .freesound-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .search-bar {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .search-bar input, .search-bar select, .search-bar button {
    font-size: 0.75rem; padding: 0.3rem 0.5rem;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-input); color: var(--text-primary); font-family: var(--font-body);
  }
  .search-bar input { outline: none; }
  .search-bar input:not([type=checkbox]) { flex: 1; min-width: 8rem; }
  .search-bar button { cursor: pointer; }
  .cc0-toggle { font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 0.25rem; align-items: center; white-space: nowrap; }
  .section-label {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em;
    color: var(--text-muted); text-transform: uppercase; padding: 0.5rem 1rem 0.25rem; flex-shrink: 0;
  }
  .results-list { flex: 1; overflow-y: auto; }
  .result-item {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-light, #eee);
    cursor: pointer;
  }
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
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }
  .error { font-size: 0.72rem; color: #c0392b; padding: 0.5rem 1rem; }
</style>
