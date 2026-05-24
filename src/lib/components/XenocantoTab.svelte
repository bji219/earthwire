<!-- src/lib/components/XenocantoTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatDuration } from '$lib/kit/types';
  import { audioPlayer } from '$lib/stores/audio-player';
  import { dragPayload } from '$lib/stores/drag';

  export let initialQuery: string = '';

  const dispatch = createEventDispatcher<{ add: { name: string; remoteSrc: string; buffer: AudioBuffer } }>();

  const FAMILIES = [
    { label: 'Warblers',     query: 'warbler' },
    { label: 'Thrushes',     query: 'thrush' },
    { label: 'Hawks',        query: 'hawk' },
    { label: 'Owls',         query: 'owl' },
    { label: 'Sparrows',     query: 'sparrow' },
    { label: 'Finches',      query: 'finch' },
    { label: 'Ducks',        query: 'duck' },
    { label: 'Woodpeckers',  query: 'woodpecker' },
    { label: 'Swallows',     query: 'swallow' },
    { label: 'Herons',       query: 'heron' },
    { label: 'Shorebirds',   query: 'sandpiper' },
    { label: 'Crows',        query: 'crow' },
  ];

  let query = '';
  let quality = 'A';
  let country = '';
  let recType = '';
  let recordings: any[] = [];
  let loading = false;
  let loadingMore = false;
  let error = '';
  let currentPage = 1;
  let totalPages = 1;
  let sentinel: HTMLDivElement;
  let resultsList: HTMLDivElement;

  const cache = new Map<string, AudioBuffer>();
  const pcmCache = new Map<string, { sr: number; nch: number; ch: Float32Array[] }>();

  onMount(() => {
    if (initialQuery) { query = initialQuery; search(); }

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && currentPage < totalPages && !loadingMore && !loading) {
        loadNextPage();
      }
    }, { root: resultsList, threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  function buildParams(page = 1): URLSearchParams {
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (quality) params.set('quality', quality);
    if (country) params.set('country', country);
    if (recType) params.set('type', recType);
    return params;
  }

  async function search() {
    if (!query.trim()) return;
    loading = true; error = ''; recordings = []; currentPage = 1; totalPages = 1;
    try {
      const res = await fetch(`/api/xeno-canto?${buildParams(1)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${res.status}`);
      }
      const data = await res.json();
      recordings = data.recordings ?? [];
      totalPages = data.numPages ?? 1;
    } catch (e: any) {
      error = e.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function loadNextPage() {
    if (loadingMore || currentPage >= totalPages) return;
    loadingMore = true;
    currentPage++;
    try {
      const res = await fetch(`/api/xeno-canto?${buildParams(currentPage)}`);
      if (!res.ok) return;
      const data = await res.json();
      recordings = [...recordings, ...(data.recordings ?? [])];
      totalPages = data.numPages ?? totalPages;
    } finally {
      loadingMore = false;
    }
  }

  function pickFamily(f: { query: string }) {
    query = f.query;
    search();
  }

  function getAudioUrl(rec: any): string {
    return `/api/xeno-canto/audio?id=${rec.id}`;
  }

  // Xeno-canto v3 returns `length` as "M:SS" or "H:MM:SS" strings, not seconds
  function parseXcLength(len: string | number | undefined): number {
    if (len == null) return 0;
    if (typeof len === 'number') return len;
    const parts = len.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  async function fetchAndDecode(rec: any, ctx: AudioContext): Promise<AudioBuffer> {
    if (cache.has(rec.id)) return cache.get(rec.id)!;
    const res = await fetch(getAudioUrl(rec));
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    const snap = {
      sr: decoded.sampleRate,
      nch: decoded.numberOfChannels,
      ch: Array.from({ length: decoded.numberOfChannels }, (_, i) => new Float32Array(decoded.getChannelData(i))),
    };
    const peak = snap.ch[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (peak < 0.0001) {
      const isBrave = 'brave' in navigator;
      throw new Error(
        isBrave
          ? 'Audio decoded as silence. Brave Shields may be blocking Web Audio — try disabling shields for this site.'
          : 'Audio decoded as silence — unable to load this sound.'
      );
    }
    pcmCache.set(rec.id, snap);
    cache.set(rec.id, decoded);
    return decoded;
  }

  function buildKitBuffer(id: string): AudioBuffer {
    const p = pcmCache.get(id)!;
    const buf = new AudioBuffer({ numberOfChannels: p.nch, length: p.ch[0].length, sampleRate: p.sr });
    p.ch.forEach((data, i) => buf.getChannelData(i).set(data));
    return buf;
  }

  function recName(rec: any): string {
    return `${rec['en'] || rec['gen']} ${rec['sp']} (XC${rec.id})`;
  }

  function playToggle(rec: any) {
    const key = rec.id;
    if ($audioPlayer.playingKey === key || $audioPlayer.loadingKey === key) {
      audioPlayer.stop();
    } else {
      audioPlayer.play(key, ctx => fetchAndDecode(rec, ctx));
    }
  }

  async function addToKit(rec: any) {
    const ctx = audioPlayer.getCtx();
    await fetchAndDecode(rec, ctx);
    dispatch('add', { name: recName(rec), remoteSrc: `https://xeno-canto.org/${rec.id}`, buffer: buildKitBuffer(rec.id) });
  }

  function handleDragStart(e: DragEvent, rec: any) {
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('application/earthwire-sound', rec.id);
    if (pcmCache.has(rec.id)) {
      dragPayload.set({ name: recName(rec), sourceType: 'xeno-canto', remoteSrc: `https://xeno-canto.org/${rec.id}`, buffer: buildKitBuffer(rec.id) });
    } else {
      fetchAndDecode(rec, audioPlayer.getCtx()).then(() =>
        dragPayload.set({ name: recName(rec), sourceType: 'xeno-canto', remoteSrc: `https://xeno-canto.org/${rec.id}`, buffer: buildKitBuffer(rec.id) })
      );
    }
  }
</script>

<div class="xeno-tab">
  <!-- Family chips -->
  <div class="family-chips">
    {#each FAMILIES as fam}
      <button
        class="chip"
        class:active={query === fam.query}
        on:click={() => pickFamily(fam)}
      >{fam.label}</button>
    {/each}
  </div>

  <!-- Search bar -->
  <div class="search-bar">
    <input bind:value={query} placeholder="Search Xeno-canto database…" on:keydown={e => e.key === 'Enter' && search()} />
    <select bind:value={recType}>
      <option value="">All types</option>
      <option value="song">Song</option>
      <option value="call">Call</option>
      <option value="alarm call">Alarm call</option>
      <option value="flight call">Flight call</option>
      <option value="flight song">Flight song</option>
      <option value="dawn song">Dawn song</option>
      <option value="subsong">Subsong</option>
      <option value="female song">Female song</option>
      <option value="advertisement call">Advertisement call</option>
      <option value="begging call">Begging call</option>
      <option value="mating call">Mating call</option>
      <option value="social call">Social call</option>
      <option value="territorial call">Territorial call</option>
      <option value="agonistic call">Agonistic call</option>
      <option value="defensive call">Defensive call</option>
      <option value="distress call">Distress call</option>
      <option value="release call">Release call</option>
      <option value="nocturnal flight call">Nocturnal flight call</option>
      <option value="courtship song">Courtship song</option>
      <option value="rivalry song">Rivalry song</option>
      <option value="calling song">Calling song</option>
      <option value="duet">Duet</option>
      <option value="drumming">Drumming</option>
      <option value="echolocation">Echolocation</option>
      <option value="imitation">Imitation</option>
      <option value="mechanical sound">Mechanical sound</option>
      <option value="feeding buzz">Feeding buzz</option>
      <option value="aberrant">Aberrant</option>
    </select>
    <select bind:value={quality}>
      <option value="">All quality</option>
      <option value="A">Quality A</option>
      <option value="B">Quality B</option>
    </select>
    <input bind:value={country} placeholder="Country" class="country-input" />
    <button on:click={search} disabled={loading}>{loading ? '…' : 'Search'}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if recordings.length > 0}
    <div class="section-label">{recordings.length} results{totalPages > 1 ? ' · more available' : ''} · Xeno-canto</div>
  {/if}

  <div class="results-list" bind:this={resultsList}>
    {#each recordings as rec}
      {@const dur = parseXcLength(rec.length)}
      <div
        class="result-item"
        draggable="true"
        on:click={() => playToggle(rec)}
        on:dragstart={e => handleDragStart(e, rec)}
        on:dragend={() => dragPayload.set(null)}
      >
        <button
          class="play-btn"
          class:playing={$audioPlayer.playingKey === rec.id}
          class:loading={$audioPlayer.loadingKey === rec.id}
          on:click|stopPropagation={() => playToggle(rec)}
        >
          {$audioPlayer.loadingKey === rec.id ? '…' : $audioPlayer.playingKey === rec.id ? '■' : '▶'}
        </button>
        <div class="result-info">
          <div class="result-name">{rec['en'] || rec['gen']} {rec['sp']}</div>
          <div class="result-meta">{rec.cnt} · XC{rec.id} · Q:{rec.q}</div>
        </div>
        {#if rec.type}
          <span class="rec-type">{rec.type}</span>
        {/if}
        <span class="result-dur">{formatDuration(dur)}</span>
        <button class="add-btn" on:click|stopPropagation={() => addToKit(rec)}>+ Add</button>
      </div>
    {/each}

    <div bind:this={sentinel} class="sentinel"></div>
    {#if loadingMore}
      <div class="loading-more">loading…</div>
    {/if}
  </div>
</div>

<style>
  .xeno-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }

  .family-chips {
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
  .search-bar input:first-of-type { flex: 1; min-width: 8rem; }
  .country-input { width: 5rem; flex: none !important; }
  .search-bar button { cursor: pointer; }

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
  .rec-type {
    font-size: 0.6rem; color: var(--text-muted); flex-shrink: 0;
    text-transform: lowercase; font-style: italic;
  }
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }
  .error { font-size: 0.72rem; color: #c0392b; padding: 0.5rem 1rem; }
  .sentinel { height: 1px; }
  .loading-more {
    text-align: center; padding: 0.75rem; font-size: 0.7rem; color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .results-list { overflow-y: visible; }
    .search-bar { padding: 0.5rem 0.75rem; flex-wrap: wrap; gap: 0.4rem; }
    .search-bar input { font-size: 0.95rem; padding: 0.55rem 0.6rem; min-height: 40px; }
    .search-bar button { min-height: 40px; padding: 0.55rem 0.85rem; font-size: 0.9rem; }
    .country-input { flex: 1 1 5rem !important; }
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
    .rec-type { font-size: 0.7rem; }
    .add-btn {
      font-size: 0.85rem;
      padding: 0.5rem 0.85rem;
      min-height: 36px;
    }
  }
</style>
