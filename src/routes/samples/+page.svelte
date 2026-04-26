<!-- src/routes/samples/+page.svelte -->
<script lang="ts">
  // Components wired in Task 13
</script>

<div class="samples-page">
  <div class="browser-panel">
    <p class="placeholder">Sample browser coming soon…</p>
  </div>
  <div class="kit-panel">
    <p class="placeholder">Kit builder coming soon…</p>
  </div>
</div>

<style>
  .samples-page {
    display: flex; flex: 1; overflow: hidden;
    font-family: var(--font-body);
  }
  .browser-panel {
    flex: 1; overflow: hidden;
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
  }
  .kit-panel {
    width: 300px; flex-shrink: 0; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .placeholder {
    padding: 1rem; color: var(--text-muted); font-size: 0.8rem;
  }
</style>
