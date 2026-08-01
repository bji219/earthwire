<script lang="ts">
  import { activate, closeUnlock, unlockPrompt, type UnlockReason } from '$lib/stores/license';
  import { ETSY_LISTING_URL, FREE_EXPORT_LIMIT, FREE_UPLOAD_LIMIT } from '$lib/license/limits';

  let keyInput = '';
  let busy = false;
  let errorMsg = '';
  let succeeded = false;

  $: open = $unlockPrompt.open;
  $: reason = $unlockPrompt.reason;

  $: if (!open) {
    errorMsg = '';
    succeeded = false;
  }

  const HEADLINES: Record<UnlockReason, string> = {
    export: FREE_EXPORT_LIMIT === 1
      ? 'You have used your free export'
      : `You have used all ${FREE_EXPORT_LIMIT} free exports`,
    trim: 'Trimming is a Pro feature',
    upload: `Free accounts can store ${FREE_UPLOAD_LIMIT} of your own sounds`,
    manual: 'Unlock Earthwire Pro',
  };

  const BLURBS: Record<UnlockReason, string> = {
    export: 'A Pro key lifts the limit so you can export as many kits as you like, as often as you like.',
    trim: 'Pro unlocks the waveform editor, so you can set exactly where every slot starts and ends instead of exporting samples at full length.',
    upload: 'A Pro key removes the cap on My Sounds. Freesound and Xeno-canto browsing stay unlimited either way.',
    manual: 'One key, bought once, unlocks unlimited exports, the waveform trim editor, and unlimited uploads of your own sounds.',
  };

  const ERRORS: Record<string, string> = {
    malformed: "That does not look like an Earthwire key. They start with EW- and are 21 characters.",
    invalid: 'That key was not recognised. Check for a typo and try again.',
    revoked: 'That key has been retired. Message me through Etsy with your order number and I will send a replacement.',
    throttled: 'Too many attempts. Wait a minute and try again.',
    network: 'Could not reach the server. Check your connection and try again.',
  };

  async function submit() {
    if (busy || !keyInput.trim()) return;
    busy = true;
    errorMsg = '';

    const result = await activate(keyInput);
    busy = false;

    if (result.ok) {
      succeeded = true;
      keyInput = '';
      setTimeout(closeUnlock, 1400);
    } else {
      errorMsg = ERRORS[result.reason] ?? ERRORS.network;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeUnlock();
  }
</script>

<svelte:window on:keydown={open ? onKeydown : undefined} />

{#if open}
  <div class="backdrop">
    <button class="scrim" on:click={closeUnlock} tabindex="-1" aria-label="Close dialog"></button>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <button class="close" on:click={closeUnlock} aria-label="Close">×</button>

      {#if succeeded}
        <p class="overline">Activated</p>
        <h2 id="unlock-title">Pro unlocked</h2>
        <p class="blurb">Every limit is lifted. Thanks for supporting Earthwire.</p>
      {:else}
        <p class="overline">Earthwire Pro</p>
        <h2 id="unlock-title">{HEADLINES[reason]}</h2>
        <p class="blurb">{BLURBS[reason]}</p>

        <form on:submit|preventDefault={submit}>
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="key-input"
            bind:value={keyInput}
            placeholder="EW-B01-XXXXX-XXXXX-XXXXXX"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="characters"
            autofocus
            disabled={busy}
          />
          <button class="unlock-btn" type="submit" disabled={busy || !keyInput.trim()}>
            {busy ? 'checking…' : 'Unlock'}
          </button>
        </form>

        {#if errorMsg}
          <p class="error">{errorMsg}</p>
        {/if}

        <a class="buy" href={ETSY_LISTING_URL} target="_blank" rel="noopener noreferrer">
          Get a key on Etsy →
        </a>
        <p class="fine">Instant download. Keys never expire and work on any browser you paste them into.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    z-index: 500;
  }
  .scrim {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(20, 20, 18, 0.45);
    cursor: default;
  }
  .dialog {
    position: relative;
    width: 100%;
    max-width: 400px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.75rem 1.6rem 1.4rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    font-family: var(--font-body);
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.65rem;
    background: none;
    border: none;
    font-size: 1.2rem;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
  }
  .close:hover { color: var(--text-primary); }

  .overline {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 0.5rem;
  }
  h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 400;
    line-height: 1.25;
    margin: 0 0 0.6rem;
    color: var(--text-primary);
  }
  .blurb {
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--text-secondary);
    margin: 0 0 1.1rem;
  }

  form { display: flex; gap: 0.5rem; }
  .key-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }
  .key-input:focus { border-color: var(--accent); }
  .key-input::placeholder { text-transform: none; color: var(--text-muted); }

  .unlock-btn {
    font-family: var(--font-body);
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0.5rem 0.95rem;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
  }
  .unlock-btn:hover:not(:disabled) { background: var(--accent-light); border-color: var(--accent-light); }
  .unlock-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .error {
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--danger);
    margin: 0.6rem 0 0;
  }

  .buy {
    display: inline-block;
    margin-top: 1.1rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--accent);
    text-decoration: none;
  }
  .buy:hover { text-decoration: underline; }

  .fine {
    font-size: 0.65rem;
    line-height: 1.5;
    color: var(--text-muted);
    margin: 0.45rem 0 0;
  }

  @media (max-width: 768px) {
    .dialog { padding: 1.5rem 1.25rem 1.25rem; }
    h2 { font-size: 1.15rem; }
    .blurb { font-size: 0.85rem; }
    form { flex-direction: column; }
    .key-input, .unlock-btn { font-size: 0.9rem; min-height: 44px; }
  }
</style>
