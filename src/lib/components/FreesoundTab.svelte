<!-- src/lib/components/FreesoundTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatDuration } from '$lib/kit/types';
  import { audioPlayer } from '$lib/stores/audio-player';
  import { dragPayload } from '$lib/stores/drag';

  const dispatch = createEventDispatcher<{ add: { name: string; previewUrl: string; buffer: AudioBuffer } }>();

  const CATEGORIES = [
    { label: 'Kick',      query: 'kick drum' },
    { label: 'Snare',     query: 'snare drum' },
    { label: 'Hi-hat',    query: 'hi-hat' },
    { label: 'Clap',      query: 'clap' },
    { label: 'Percussion',query: 'percussion hit' },
    { label: 'Bass',      query: 'bass hit' },
    { label: 'FX',        query: 'sound effect hit' },
    { label: 'Ambient',   query: 'ambient texture' },
    { label: 'Foley',     query: 'foley' },
    { label: 'Voice',     query: 'vocal chop' },
    { label: 'Vinyl',     query: 'vinyl crackle' },
    { label: 'Nature',    query: 'nature field recording' },
  ];

  let query = '';
  let maxDuration = '';
  let cc0Only = false;
  let results: any[] = [];
  let loading = false;
  let loadingMore = false;
  let hasMore = false;
  let currentPage = 1;
  let error = '';
  let sentinel: HTMLDivElement;
  let resultsList: HTMLDivElement;

  onMount(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        loadNextPage();
      }
    }, { root: resultsList, threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  // Playback cache — Chrome may recycle this buffer's backing memory after playback
  const cache = new Map<number, AudioBuffer>();
  // PCM snapshot — plain Float32Arrays extracted immediately at decode time, before any playback
  // These live in JS heap and are never touched by the audio rendering thread
  const pcmCache = new Map<number, { sr: number; nch: number; ch: Float32Array[] }>();

  function getAudioUrl(result: any): string {
    const cdnUrl = result.previews?.['preview-hq-mp3'] ?? result.previews?.['preview-lq-mp3'] ?? '';
    return `/api/freesound?action=download&url=${encodeURIComponent(cdnUrl)}`;
  }

  async function fetchAndDecode(result: any, ctx: AudioContext): Promise<AudioBuffer> {
    if (cache.has(result.id)) return cache.get(result.id)!;
    const res = await fetch(getAudioUrl(result));
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    const snap = {
      sr: decoded.sampleRate,
      nch: decoded.numberOfChannels,
      ch: Array.from({ length: decoded.numberOfChannels }, (_, i) => new Float32Array(decoded.getChannelData(i))),
    };
    // Detect browsers that zero out Web Audio data (e.g. Brave with strict fingerprinting)
    const peak = snap.ch[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (peak < 0.0001) {
      const isBrave = 'brave' in navigator;
      throw new Error(
        isBrave
          ? 'Audio decoded as silence. Brave Shields may be blocking Web Audio — try disabling shields for this site.'
          : 'Audio decoded as silence — unable to load this sound.'
      );
    }
    pcmCache.set(result.id, snap);
    cache.set(result.id, decoded);
    return decoded;
  }

  function buildKitBuffer(id: number): AudioBuffer {
    const p = pcmCache.get(id)!;
    const buf = new AudioBuffer({ numberOfChannels: p.nch, length: p.ch[0].length, sampleRate: p.sr });
    p.ch.forEach((data, i) => buf.getChannelData(i).set(data));
    return buf;
  }

  function buildParams(page = 1): URLSearchParams {
    const params = new URLSearchParams({ action: 'search', q: query, page: String(page) });
    if (maxDuration) params.set('max_duration', maxDuration);
    if (cc0Only) params.set('cc0', '1');
    return params;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; results = []; currentPage = 1; hasMore = false;
    try {
      const res = await fetch(`/api/freesound?${buildParams(1)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${res.status}`);
      }
      const data = await res.json();
      results = data.results ?? [];
      hasMore = !!data.next;
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function loadNextPage() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    currentPage++;
    try {
      const res = await fetch(`/api/freesound?${buildParams(currentPage)}`);
      if (!res.ok) return;
      const data = await res.json();
      results = [...results, ...(data.results ?? [])];
      hasMore = !!data.next;
    } finally {
      loadingMore = false;
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
    await fetchAndDecode(result, ctx); // ensures pcmCache is populated
    dispatch('add', { name: result.name, previewUrl: result.url, buffer: buildKitBuffer(result.id) });
  }

  function handleDragStart(e: DragEvent, result: any) {
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('application/earthwire-sound', String(result.id));
    if (pcmCache.has(result.id)) {
      dragPayload.set({ name: result.name, sourceType: 'freesound', remoteSrc: result.url, buffer: buildKitBuffer(result.id) });
    } else {
      fetchAndDecode(result, audioPlayer.getCtx()).then(() =>
        dragPayload.set({ name: result.name, sourceType: 'freesound', remoteSrc: result.url, buffer: buildKitBuffer(result.id) })
      );
    }
  }
</script>

<div class="freesound-tab">
  <div class="category-chips">
    {#each CATEGORIES as cat}
      <button
        class="chip"
        class:active={query === cat.query}
        on:click={() => { query = cat.query; search(); }}
      >{cat.label}</button>
    {/each}
  </div>

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

  <div class="results-list" bind:this={resultsList}>
    {#if results.length > 0}
      <div class="section-label">{results.length} results · Freesound</div>
    {/if}
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
    <div bind:this={sentinel} class="sentinel"></div>
    {#if loadingMore}<div class="loading-more">loading…</div>{/if}
  </div>
</div>

<style>
  .freesound-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .category-chips {
    display: flex; flex-wrap: wrap; gap: 0.35rem;
    padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .chip {
    font-size: 0.65rem; padding: 0.2rem 0.6rem;
    border: 1px solid var(--border); border-radius: 20px;
    background: none; color: var(--text-muted); cursor: pointer;
    font-family: var(--font-body); transition: border-color 120ms, color 120ms;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
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
  .sentinel { height: 1px; }
  .loading-more { text-align: center; padding: 0.75rem; font-size: 0.7rem; color: var(--text-muted); }

  @media (max-width: 768px) {
    .results-list { overflow-y: visible; }
    .search-bar { padding: 0.5rem 0.75rem; flex-wrap: wrap; gap: 0.4rem; }
    .search-bar input:not([type=checkbox]) { font-size: 0.95rem; padding: 0.55rem 0.6rem; min-height: 40px; }
    .search-bar button { min-height: 40px; padding: 0.55rem 0.85rem; font-size: 0.9rem; }
    .result-item {
      min-height: 56px;
      padding: 0.65rem 0.85rem;
      gap: 0.75rem;
    }
    .play-btn {
      width: 36px;
      height: 36px;
      font-size: 0.85rem;
    }
    .result-name { font-size: 0.9rem; }
    .result-meta { font-size: 0.75rem; }
    .result-dur { font-size: 0.8rem; }
    .add-btn {
      font-size: 0.85rem;
      padding: 0.5rem 0.85rem;
      min-height: 36px;
    }
  }
</style>
