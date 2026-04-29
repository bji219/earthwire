import { writable } from 'svelte/store';
import type { BeatSubdivision } from '../nodes/types.js';

export const bpm = writable(120);
export const isPlaying = writable(false);
export const subdivision = writable<BeatSubdivision>('1/16');
export const swing = writable(0);
