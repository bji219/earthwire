import { writable, get } from 'svelte/store';

interface PlayerState {
  playingKey: string | null;
  loadingKey: string | null;
}

function createAudioPlayer() {
  const store = writable<PlayerState>({ playingKey: null, loadingKey: null });
  let ctx: AudioContext | null = null;
  let currentSrc: AudioBufferSourceNode | null = null;

  function getCtx(): AudioContext {
    if (!ctx || ctx.state === 'closed') {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new Ctor();
    }
    // iOS Safari and some Android browsers start the context in 'suspended'
    // state. resume() must be called synchronously inside the user gesture
    // (i.e. before any awaits in the caller) or playback stays silent.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(err => console.warn('[audio-player] resume failed', err));
    }
    return ctx;
  }

  function stop() {
    if (currentSrc) {
      try { currentSrc.stop(); } catch { /* already stopped */ }
      currentSrc = null;
    }
    store.set({ playingKey: null, loadingKey: null });
  }

  async function play(
    key: string,
    getBuffer: (ctx: AudioContext) => Promise<AudioBuffer>,
    trimStart = 0,
    trimEnd?: number
  ) {
    stop();
    store.set({ playingKey: null, loadingKey: key });
    // Acquire context synchronously so resume() lands inside the gesture.
    const audioCtx = getCtx();
    try {
      const buffer = await getBuffer(audioCtx);
      if (get(store).loadingKey !== key) return; // cancelled by stop() or new play()
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      src.start(0, trimStart, trimEnd !== undefined ? trimEnd - trimStart : undefined);
      currentSrc = src;
      store.set({ playingKey: key, loadingKey: null });
      src.onended = () => {
        if (currentSrc === src) {
          currentSrc = null;
          store.set({ playingKey: null, loadingKey: null });
        }
      };
    } catch (err) {
      console.warn('[audio-player] play failed', err);
      store.set({ playingKey: null, loadingKey: null });
    }
  }

  return { subscribe: store.subscribe, play, stop, getCtx };
}

export const audioPlayer = createAudioPlayer();
