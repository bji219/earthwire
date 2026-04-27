<!-- src/lib/components/XenocantoTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatDuration } from '$lib/kit/types';

  export let initialQuery: string = '';

  const dispatch = createEventDispatcher<{ add: { name: string; remoteSrc: string; buffer: AudioBuffer } }>();

  let query = '';
  let quality = 'A';
  let country = '';
  let results: any[] = [];
  let loading = false;
  let error = '';
  let audioCtx: AudioContext | null = null;
  let playingId: string | null = null;

  onMount(() => {
    if (initialQuery) { query = initialQuery; search(); }
  });

  function getCtx() {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
    return audioCtx;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = [];
    try {
      const params = new URLSearchParams({ q: query });
      if (quality) params.set('quality', quality);
      if (country) params.set('country', country);
      const res = await fetch(`/api/xeno-canto?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${res.status}`);
      }
      const data = await res.json();
      results = data.recordings ?? [];
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  function getAudioUrl(rec: any): string {
    return rec.file ?? `https://xeno-canto.org/${rec.id}/download`;
  }

  async function playPreview(rec: any) {
    playingId = rec.id;
    const ctx = getCtx();
    const url = getAudioUrl(rec);
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
    src.onended = () => { if (playingId === rec.id) playingId = null; };
  }

  async function addToKit(rec: any) {
    const ctx = getCtx();
    const url = getAudioUrl(rec);
    const res = await fetch(url);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const name = `${rec['en'] || rec['gen']} ${rec['sp']} (XC${rec.id})`;
    dispatch('add', { name, remoteSrc: `https://xeno-canto.org/${rec.id}`, buffer });
  }
</script>

<div class="xeno-tab">
  <div class="search-bar">
    <input
      bind:value={query}
      placeholder="Species name…"
      on:keydown={e => e.key === 'Enter' && search()}
    />
    <select bind:value={quality}>
      <option value="">All quality</option>
      <option value="A">Quality A</option>
      <option value="B">Quality B</option>
    </select>
    <input bind:value={country} placeholder="Country" class="country-input" />
    <button on:click={search} disabled={loading}>{loading ? '…' : 'Search'}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if results.length > 0}
    <div class="section-label">{results.length} results · Xeno-canto</div>
    {#each results as rec}
      {@const dur = parseFloat(rec.length ?? '0')}
      <div class="result-item">
        <button class="play-btn" class:playing={playingId === rec.id} on:click={() => playPreview(rec)}>
          {playingId === rec.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{rec['en'] || rec['gen']} {rec['sp']}</div>
          <div class="result-meta">{rec.cnt} · XC{rec.id} · Q:{rec.q}</div>
        </div>
        <span class="result-dur">{formatDuration(dur)}</span>
        <button class="add-btn" on:click={() => addToKit(rec)}>+ Add</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .xeno-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .search-bar {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .search-bar input, .search-bar select, .search-bar button {
    font-size: 0.75rem; padding: 0.3rem 0.5rem;
    border: 1px solid var(--border); border-radius: 4px;
    background: var(--bg-input); color: var(--text-primary);
  }
  .search-bar input { outline: none; }
  .search-bar input:first-of-type { flex: 1; min-width: 8rem; }
  .country-input { width: 5rem; }
  .search-bar button { cursor: pointer; font-family: var(--font-body); }
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
