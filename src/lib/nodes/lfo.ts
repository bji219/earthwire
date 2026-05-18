import type { LFOShape, LFOConfig } from './types.js';

export type { LFOShape, LFOConfig } from './types.js';

export interface LFO {
  /** input: normalized env-data value 0–1. nowSec: seconds since epoch (defaults to Date.now()/1000). */
  process(input: number, nowSec?: number): number;
  reset(): void;
}

export function shapeValue(shape: LFOShape, phase: number): number {
  switch (shape) {
    case 'sine':     return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    case 'triangle': return phase < 0.5 ? phase * 2 : 2 - phase * 2;
    case 'square':   return phase < 0.5 ? 1 : 0;
    case 'saw':      return phase;
    case 'rsaw':     return 1 - phase;
  }
}

export function createLFO(config: LFOConfig): LFO {
  let startTime: number | null = null;

  function process(input: number, nowSec?: number): number {
    const t = nowSec ?? Date.now() / 1000;
    if (startTime === null) startTime = t;
    const phase = ((t - startTime) * config.rate) % 1;
    const osc = shapeValue(config.shape, phase);
    return input + (osc - input) * config.depth;
  }

  function reset(): void {
    startTime = null;
  }

  return { process, reset };
}
