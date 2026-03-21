import type { ThresholdConfig } from './types.js';
import type { TriggerEvent } from '$lib/engine/types.js';

export interface Threshold {
  process(value: number, timestamp: number): TriggerEvent | null;
  reset(): void;
}

export function createThreshold(config: ThresholdConfig): Threshold {
  let wasAbove: boolean | null = null;

  function process(value: number, timestamp: number): TriggerEvent | null {
    const isAbove = value >= config.level;

    if (wasAbove === null) {
      wasAbove = isAbove;
      return null;
    }

    let fired = false;

    if (config.direction === 'rising' || config.direction === 'both') {
      if (!wasAbove && isAbove) fired = true;
    }

    if (config.direction === 'falling' || config.direction === 'both') {
      if (wasAbove && !isAbove) fired = true;
    }

    wasAbove = isAbove;

    if (!fired) return null;

    const distance = Math.abs(value - config.level);
    const velocity = Math.round(Math.min(127, 64 + distance * 127));

    return { timestamp, velocity };
  }

  function reset(): void {
    wasAbove = null;
  }

  return { process, reset };
}
