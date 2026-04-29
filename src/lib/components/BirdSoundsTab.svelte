<!-- src/lib/components/BirdSoundsTab.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import XenocantoTab from './XenocantoTab.svelte';

  const dispatch = createEventDispatcher();

  const FAMILIES = [
    { name: 'Warblers',     query: 'warbler' },
    { name: 'Thrushes',     query: 'thrush' },
    { name: 'Raptors',      query: 'hawk' },
    { name: 'Shorebirds',   query: 'sandpiper' },
    { name: 'Owls',         query: 'owl' },
    { name: 'Nightingales', query: 'nightingale' },
    { name: 'Finches',      query: 'finch' },
    { name: 'Ducks & Geese', query: 'duck' },
    { name: 'Woodpeckers',  query: 'woodpecker' },
    { name: 'Hummingbirds', query: 'hummingbird' },
    { name: 'Sparrows',     query: 'sparrow' },
    { name: 'Crows & Jays', query: 'crow' },
  ];

  let selectedQuery = '';
</script>

<div class="bird-tab">
  {#if !selectedQuery}
    <div class="family-grid">
      {#each FAMILIES as fam}
        <button class="family-btn" on:click={() => selectedQuery = fam.query}>
          🐦 {fam.name}
        </button>
      {/each}
    </div>
  {:else}
    <div class="back-bar">
      <button class="back-btn" on:click={() => selectedQuery = ''}>← Back to families</button>
    </div>
    <XenocantoTab initialQuery={selectedQuery} on:add={e => dispatch('add', e.detail)} />
  {/if}
</div>

<style>
  .bird-tab { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
  .family-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 1rem;
  }
  .family-btn {
    padding: 0.65rem 0.75rem; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-input); color: var(--text-primary); font-size: 0.78rem;
    cursor: pointer; text-align: left; font-family: var(--font-body);
  }
  .family-btn:hover { border-color: var(--accent); color: var(--accent); }
  .back-bar { padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .back-btn {
    font-size: 0.75rem; background: none; border: none;
    color: var(--text-muted); cursor: pointer; padding: 0; font-family: var(--font-body);
  }
  .back-btn:hover { color: var(--accent); }
</style>
