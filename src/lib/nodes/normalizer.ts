import type { NormalizerConfig } from './types.js';

export interface Normalizer {
  process(rawValue: number): number;
  reset(): void;
}

export function createNormalizer(config: NormalizerConfig): Normalizer {
  let observedMin = Infinity;
  let observedMax = -Infinity;
  let sampleCount = 0;

  function process(rawValue: number): number {
    if (config.mode === 'manual') {
      return manualNormalize(rawValue, config.min ?? 0, config.max ?? 1);
    }
    return autoNormalize(rawValue);
  }

  function manualNormalize(value: number, min: number, max: number): number {
    if (min === max) return 0.5;
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized));
  }

  function autoNormalize(value: number): number {
    sampleCount++;
    if (sampleCount === 1) {
      observedMin = value;
      observedMax = value;
      return 0.5;
    }
    observedMin = Math.min(observedMin, value);
    observedMax = Math.max(observedMax, value);
    if (observedMin === observedMax) return 0.5;
    return (value - observedMin) / (observedMax - observedMin);
  }

  function reset(): void {
    observedMin = Infinity;
    observedMax = -Infinity;
    sampleCount = 0;
  }

  return { process, reset };
}
