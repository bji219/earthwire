<!-- src/lib/components/FreesoundTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatDuration } from '$lib/kit/types';

  const dispatch = createEventDispatcher<{ add: { name: string; previewUrl: string; buffer: AudioBuffer } }>();

  let query = '';
  let maxDuration = '';
  let cc0Only = false;
  let results: any[] = [];
  let loading = false;
  let error = '';
  let audioCtx: AudioContext | null = null;
  let playingId: number | null = null;

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = [];
    try {
      const params = new URLSearchParams({ action: 'search', q: query });
      if (maxDuration) params.set('max_duration', maxDuration);
      if (cc0Only) params.set('cc0', '1');
      const res = await fetch(`/api/freesound?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      results = data.results ?? [];
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function playPreview(result: any) {
    const url = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'];
    if (!url) return;
    playingId = result.id;
    const ctx = getCtx();
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
    src.onended = () => { if (playingId === result.id) playingId = null; };
  }

  async function addToKit(result: any) {
    const url = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'];
    if (!url) return;
    const ctx = getCtx();
    const res = await fetch(url);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    dispatch('add', { name: result.name, previewUrl: result.url, buffer });
  }
</script>

<div class="freesound-tab">
  <div class="search-bar">
    <input
      bind:value={query}
      placeholder="Search Freesound…"
      on:keydown={e => e.key === 'Enter' && search()}
    />
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
    {#each results as result}
      <div class="result-item">
        <button class="play-btn" class:playing={playingId === result.id} on:click={() => playPreview(result)}>
          {playingId === result.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{result.name}</div>
          <div class="result-meta">{result.username} · {result.license?.includes('0') ? 'CC0' : 'CC'}</div>
        </div>
        <span class="result-dur">{formatDuration(result.duration)}</span>
        <button class="add-btn" on:click={() => addToKit(result)}>+ Add</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .freesound-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .search-bar {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .search-bar input:not([type=checkbox]), .search-bar select, .search-bar button {
    font-size: 0.75rem; padding: 0.3rem 0.5rem;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-input); color: var(--text-primary);
  }
  .search-bar input:not([type=checkbox]) { flex: 1; min-width: 8rem; outline: none; }
  .search-bar button { cursor: pointer; font-family: var(--font-body); }
  .cc0-toggle { font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 0.25rem; align-items: center; white-space: nowrap; }
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
  .play-btn.playing { background: var(--accent); }
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
