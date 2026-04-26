<!-- src/routes/samples/+layout.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="samples-app">
  <header class="samples-header">
    <button class="brand" on:click={() => goto('/')}>Earthwire</button>
    <nav>
      <a href="/" class="nav-link">Sequencer</a>
      <a href="/samples" class="nav-link active">Samples</a>
    </nav>
  </header>
  <main>
    <slot />
  </main>
</div>

<style>
  .samples-app { display: flex; flex-direction: column; height: 100vh; background: var(--bg-primary); }
  .samples-header {
    display: flex; align-items: center; gap: 1.5rem;
    padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--border);
    font-size: 0.78rem; background: var(--bg-primary); flex-shrink: 0;
  }
  .brand {
    font-weight: 700; letter-spacing: -0.02em; background: none;
    border: none; cursor: pointer; color: var(--text-primary); font-size: 0.85rem;
    font-family: var(--font-body);
  }
  nav { display: flex; gap: 1rem; }
  .nav-link { color: var(--text-muted); text-decoration: none; font-size: 0.78rem; }
  .nav-link.active { color: var(--text-primary); font-weight: 600; }
  main { flex: 1; overflow: hidden; display: flex; }
</style>
