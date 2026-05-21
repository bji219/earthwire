<!-- src/lib/components/SampleBrowser.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MySoundsTab   from './MySoundsTab.svelte';
  import FreesoundTab  from './FreesoundTab.svelte';
  import XenocantoTab  from './XenocantoTab.svelte';

  const dispatch = createEventDispatcher<{
    add: {
      name: string;
      sourceType: 'local' | 'freesound' | 'xeno-canto';
      remoteSrc?: string;
      buffer: AudioBuffer;
    }
  }>();

  type Tab = 'my-sounds' | 'freesound' | 'birds';
  let activeTab: Tab = 'my-sounds';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'my-sounds', label: '📁 My Sounds' },
    { id: 'freesound', label: '🌿 Freesound'  },
    { id: 'birds',     label: '🐦 Bird Sounds' },
  ];

  function handleMyAdd(e: CustomEvent<{ sound: any; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.sound.name, sourceType: 'local', buffer: e.detail.buffer });
  }
  function handleFsAdd(e: CustomEvent<{ name: string; previewUrl: string; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.name, sourceType: 'freesound', remoteSrc: e.detail.previewUrl, buffer: e.detail.buffer });
  }
  function handleXcAdd(e: CustomEvent<{ name: string; remoteSrc: string; buffer: AudioBuffer }>) {
    dispatch('add', { name: e.detail.name, sourceType: 'xeno-canto', remoteSrc: e.detail.remoteSrc, buffer: e.detail.buffer });
  }
</script>

<div class="sample-browser">
  <div class="tabs">
    {#each TABS as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        on:click={() => activeTab = tab.id}
      >{tab.label}</button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === 'my-sounds'}
      <MySoundsTab on:add={handleMyAdd} />
    {:else if activeTab === 'freesound'}
      <FreesoundTab on:add={handleFsAdd} />
    {:else}
      <XenocantoTab on:add={handleXcAdd} />
    {/if}
  </div>
</div>

<style>
  .sample-browser { display: flex; flex-direction: column; height: 100%; }

  .tabs {
    display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;
    overflow-x: auto;
  }
  .tab {
    padding: 0.55rem 1rem; font-size: 0.75rem; font-weight: 500;
    color: var(--text-muted); background: none; border: none;
    border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;
    font-family: var(--font-body);
  }
  .tab.active { color: var(--text-primary); border-bottom-color: var(--text-primary); }
  .tab-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
