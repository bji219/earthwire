<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

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
    <a href="/sequencer" class="nav-link" class:active={$page.url.pathname === '/sequencer'}>Sequencer</a>
  </nav>
</div>

<div class="layout-content"><slot /></div>

<footer class="site-footer">
  <a href="https://github.com/bji219" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 3.003-.404c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  </a>
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
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .site-footer svg {
    width: 15px; height: 15px;
    vertical-align: middle; fill: currentColor; display: block;
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
  }
</style>
