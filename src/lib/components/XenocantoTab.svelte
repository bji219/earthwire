<!-- src/lib/components/XenocantoTab.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatDuration } from '$lib/kit/types';
  import { audioPlayer } from '$lib/stores/audio-player';
  import { dragPayload } from '$lib/stores/drag';

  export let initialQuery: string = '';

  const dispatch = createEventDispatcher<{ add: { name: string; remoteSrc: string; buffer: AudioBuffer } }>();

  let query = '';
  let quality = 'A';
  let country = '';
  let results: any[] = [];
  let loading = false;
  let error = '';

  const cache = new Map<string, AudioBuffer>();
  const pcmCache = new Map<string, { sr: number; nch: number; ch: Float32Array[] }>();

  onMount(() => {
    if (initialQuery) { query = initialQuery; search(); }
  });

  function getAudioUrl(rec: any): string {
    return `/api/xeno-canto/audio?id=${rec.id}`;
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
  <div class="search-bar">
    <input bind:value={query} placeholder="Species name…" on:keydown={e => e.key === 'Enter' && search()} />
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
    <div class="results-list">
      {#each results as rec}
        {@const dur = parseFloat(rec.length ?? '0')}
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
          <span class="result-dur">{formatDuration(dur)}</span>
          <button class="add-btn" on:click|stopPropagation={() => addToKit(rec)}>+ Add</button>
        </div>
      {/each}
    </div>
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
  .result-dur { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .add-btn {
    font-size: 0.68rem; padding: 0.18rem 0.5rem; border: 1px solid var(--border);
    border-radius: 3px; background: none; cursor: pointer; flex-shrink: 0; color: var(--text-muted);
  }
  .add-btn:hover { border-color: var(--accent); color: var(--accent); }
  .error { font-size: 0.72rem; color: #c0392b; padding: 0.5rem 1rem; }
</style>
