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
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
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
    try {
      const audioCtx = getCtx();
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
    } catch {
      store.set({ playingKey: null, loadingKey: null });
    }
  }

  return { subscribe: store.subscribe, play, stop, getCtx };
}

export const audioPlayer = createAudioPlayer();
