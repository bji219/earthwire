import type { SmootherConfig, SmootherMode } from './types.js';

export interface Smoother {
  process(value: number): number;
  reset(): void;
}

// Map legacy mode names from saved patches
const LEGACY_MODES: Record<string, SmootherMode> = {
  ema: 'deep-smooth',
  slew: 'glide',
  'sample-hold': 'step'
};

export function createSmoother(config: SmootherConfig): Smoother {
  const mode = LEGACY_MODES[config.mode as string] ?? config.mode;
  switch (mode) {
    case 'deep-smooth': return createDeepSmoother(config.amount);
    case 'glide': return createGlideSmoother(config.amount);
    case 'step': return createStepSmoother(config.amount);
    case 'smooth':
    default: return createLinearSmoother(config.amount);
  }
}

function createLinearSmoother(amount: number): Smoother {
  let previous: number | null = null;

  // Simple linear EMA: amount=0 → α=1 (passthrough), amount=1 → α=0 (full hold)
  const alpha = 1 - amount;

  function process(value: number): number {
    if (previous === null) {
      previous = value;
      return value;
    }
    previous = alpha * value + (1 - alpha) * previous;
    return previous;
  }

  function reset(): void {
    previous = null;
  }

  return { process, reset };
}

function createDeepSmoother(amount: number): Smoother {
  let previous: number | null = null;

  // Exponential curve: spreads the musical sweet spot across the full slider range.
  // amount=0 → α=1 (passthrough), amount=0.5 → α≈0.03, amount=1 → α≈0.001
  const alpha = amount === 0 ? 1 : Math.pow(10, -3 * amount);

  function process(value: number): number {
    if (previous === null) {
      previous = value;
      return value;
    }
    previous = alpha * value + (1 - alpha) * previous;
    return previous;
  }

  function reset(): void {
    previous = null;
  }

  return { process, reset };
}

function createGlideSmoother(amount: number): Smoother {
  let previous: number | null = null;

  // Max change per tick: amount=0 → 1.0 (instant), amount=1 → ~0.003 per tick
  const maxDelta = amount === 0 ? Infinity : Math.pow(10, -2.5 * amount);

  function process(value: number): number {
    if (previous === null) {
      previous = value;
      return value;
    }
    const delta = value - previous;
    const clamped = Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);
    previous = previous + clamped;
    return previous;
  }

  function reset(): void {
    previous = null;
  }

  return { process, reset };
}

function createStepSmoother(amount: number): Smoother {
  let held: number | null = null;
  let tickCount = 0;

  // Hold duration: amount=0 → 1 tick (passthrough), amount=1 → 32 ticks
  const holdTicks = Math.round(amount * 31) + 1;

  function process(value: number): number {
    if (held === null) {
      held = value;
      tickCount = 0;
      return value;
    }
    tickCount++;
    if (tickCount >= holdTicks) {
      held = value;
      tickCount = 0;
    }
    return held;
  }

  function reset(): void {
    held = null;
    tickCount = 0;
  }

  return { process, reset };
}
