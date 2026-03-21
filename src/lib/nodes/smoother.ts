import type { SmootherConfig } from './types.js';

export interface Smoother {
  process(value: number): number;
  reset(): void;
}

export function createSmoother(config: SmootherConfig): Smoother {
  let previous: number | null = null;

  function process(value: number): number {
    if (previous === null) {
      previous = value;
      return value;
    }
    const alpha = 1 - config.amount;
    previous = alpha * value + (1 - alpha) * previous;
    return previous;
  }

  function reset(): void {
    previous = null;
  }

  return { process, reset };
}
