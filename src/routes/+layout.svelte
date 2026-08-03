<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import UnlockDialog from '$lib/components/UnlockDialog.svelte';
  import { isUnlocked, openUnlock } from '$lib/stores/license';

  onMount(async () => {
    if (!browser) return;
    const { inject } = await import('@vercel/analytics');
    inject();
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="layout-shell">
<div class="site-header">
  <a href="/" class="wordmark">Earthwire</a>
  <nav class="site-nav">
    <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>Kit Designer</a>
    <a href="/docs/getting-started" class="nav-link" class:active={$page.url.pathname.startsWith('/docs')}>Docs</a>
  </nav>

  {#if $isUnlocked}
    <span class="pro-chip unlocked" title="Earthwire Pro is active in this browser">Pro ✓</span>
  {:else}
    <button class="pro-chip" on:click={() => openUnlock('manual')}>Unlock Pro</button>
  {/if}
</div>

<div class="layout-content"><slot /></div>

<UnlockDialog />

<footer class="site-footer">
  <a href="https://idw3d.com" target="_blank" rel="noopener noreferrer">idw3d.com</a>
  <span class="sep">·</span>
  <a href="https://idw3d.etsy.com" target="_blank" rel="noopener noreferrer">Etsy</a>
</footer>
</div>

<style>
  .site-header {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 0.55rem 1.5rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-input);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    position: sticky;
    top: 0;
    z-index: 100;
    flex-shrink: 0;
  }
  .wordmark {
    font-family: var(--font-display, 'DM Serif Display', Georgia, serif);
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .site-nav {
    display: flex;
    gap: 0.1rem;
  }
  .nav-link {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    border-bottom: 2px solid transparent;
    transition: color 150ms;
    font-family: var(--font-body, sans-serif);
  }
  .nav-link:hover { color: var(--text-primary); }
  .nav-link.active { color: var(--text-primary); border-bottom-color: var(--text-primary); }

  .pro-chip {
    margin-left: auto;
    font-family: var(--font-body, sans-serif);
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--accent);
    color: var(--accent);
    background: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .pro-chip:hover { background: var(--accent); color: #fff; }
  .pro-chip.unlocked {
    background: var(--accent-bg);
    cursor: default;
  }
  .pro-chip.unlocked:hover { background: var(--accent-bg); color: var(--accent); }

  .site-footer {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    padding: 0.65rem 1rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    font-family: var(--font-body, sans-serif);
  }
  .site-footer a { color: var(--text-muted); text-decoration: none; }
  .site-footer a:hover { color: var(--text-primary); }

  .layout-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .layout-content {
    flex: 1;
    min-height: 0;
    /* auto, not hidden: the kit designer manages its own internal scrolling and
       never overflows here, but long pages like /docs need to scroll. */
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sep { opacity: 0.4; }

  @media (max-width: 768px) {
    .layout-shell {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }
    .layout-content {
      overflow: visible;
    }
    .site-header {
      padding: 0.55rem 1rem;
      gap: 1rem;
    }
    .nav-link {
      padding: 0.5rem 0.7rem;
      font-size: 0.8rem;
    }
    .pro-chip {
      font-size: 0.72rem;
      padding: 0.35rem 0.7rem;
      min-height: 32px;
    }
  }
</style>
