import { writable, get } from 'svelte/store';

interface PlayerState {
  playingKey: string | null;
  loadingKey: string | null;
}

// iOS WebKit (Safari, DuckDuckGo, every iOS browser) categorises Web Audio
// API output as "ambient/notification" audio by default, so the physical
// silent switch mutes it. Playing a looping silent HTMLAudioElement first
// upgrades the tab's playback category to "media" — same channel as
// YouTube — and subsequent Web Audio output rides along.
let silentAudio: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let silentStarted = false;

function buildSilentWavUrl(): string {
  // 1 second of mono 8 kHz silence — small enough to keep the page light,
  // long enough that browsers won't skip the playback.
  const sampleRate = 8000;
  const numSamples = sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  // PCM payload is already zero-initialised — silence.
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function unlockMediaCategory() {
  if (silentStarted) return;
  if (typeof document === 'undefined') return;
  try {
    if (!silentAudio) {
      silentUrl = buildSilentWavUrl();
      silentAudio = document.createElement('audio');
      silentAudio.src = silentUrl;
      silentAudio.loop = true;
      silentAudio.preload = 'auto';
      silentAudio.muted = false;
      silentAudio.setAttribute('playsinline', '');
      silentAudio.setAttribute('webkit-playsinline', '');
      silentAudio.style.display = 'none';
      document.body.appendChild(silentAudio);
    }
    const p = silentAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { silentStarted = true; })
       .catch(err => console.warn('[audio-player] silent unlock failed', err));
    } else {
      silentStarted = true;
    }
  } catch (err) {
    console.warn('[audio-player] silent unlock threw', err);
  }
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
    // Synchronous gesture-window calls: unlock the iOS media category
    // (so silent switch doesn't mute), then acquire/resume the context.
    unlockMediaCategory();
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
