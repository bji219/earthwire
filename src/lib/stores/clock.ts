import { writable } from 'svelte/store';

export const bpm = writable(120);
export const isPlaying = writable(false);
