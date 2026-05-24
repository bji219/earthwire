import { createNormalizer, type Normalizer } from '../nodes/normalizer.js';
import { createSmoother, type Smoother } from '../nodes/smoother.js';
import { createQuantizer, type Quantizer } from '../nodes/quantizer.js';
import { createThreshold, type Threshold } from '../nodes/threshold.js';
import type { ChannelConfig, ChannelOutput } from './types.js';

interface ChannelState {
  config: ChannelConfig;
  normalizer: Normalizer;
  smoother: Smoother | null;
  quantizer: Quantizer | null;
  threshold: Threshold | null;
}

export class EarthwireEngine {
  private channels: ChannelState[] = [];

  get channelCount(): number {
    return this.channels.length;
  }

  addChannel(config: ChannelConfig): void {
    this.channels.push({
      config,
      normalizer: createNormalizer(config.normalizer),
      smoother:  config.smoother  ? createSmoother(config.smoother)   : null,
      quantizer: config.quantizer ? createQuantizer(config.quantizer) : null,
      threshold: config.threshold ? createThreshold(config.threshold) : null
    });
  }

  removeChannel(index: number): void {
    this.channels.splice(index, 1);
  }

  updateChannel(index: number, config: ChannelConfig): void {
    if (index < 0 || index >= this.channels.length) return;
    this.channels[index] = {
      config,
      normalizer: createNormalizer(config.normalizer),
      smoother:  config.smoother  ? createSmoother(config.smoother)   : null,
      quantizer: config.quantizer ? createQuantizer(config.quantizer) : null,
      threshold: config.threshold ? createThreshold(config.threshold) : null
    };
  }

  syncChannels(configs: ChannelConfig[]): void {
    while (this.channels.length > configs.length) {
      this.channels.pop();
    }
    for (let i = 0; i < configs.length; i++) {
      if (i >= this.channels.length) {
        this.addChannel(configs[i]);
      } else {
        this.patchChannel(i, configs[i]);
      }
    }
  }

  // Preserves stateful node instances (e.g. auto-normalizer's observed
  // min/max, smoother's last value) when only unrelated config fields change.
  // Without this, every syncChannels call — including adding/removing other
  // channels — would wipe each channel's learned state and flatline its
  // output until enough new samples arrived to re-learn the range.
  private patchChannel(index: number, next: ChannelConfig): void {
    const existing = this.channels[index];
    const prev = existing.config;
    this.channels[index] = {
      config: next,
      normalizer: sameJson(prev.normalizer, next.normalizer)
        ? existing.normalizer
        : createNormalizer(next.normalizer),
      smoother: sameJson(prev.smoother, next.smoother)
        ? existing.smoother
        : next.smoother ? createSmoother(next.smoother) : null,
      quantizer: sameJson(prev.quantizer, next.quantizer)
        ? existing.quantizer
        : next.quantizer ? createQuantizer(next.quantizer) : null,
      threshold: sameJson(prev.threshold, next.threshold)
        ? existing.threshold
        : next.threshold ? createThreshold(next.threshold) : null,
    };
  }

  processValue(channelIndex: number, rawValue: number): ChannelOutput {
    const channel = this.channels[channelIndex];
    if (!channel) {
      return { continuous: 0, trigger: null, note: null };
    }

    let value = channel.normalizer.process(rawValue);

    if (channel.smoother) {
      value = channel.smoother.process(value);
    }

    const note = channel.quantizer ? channel.quantizer.process(value) : null;

    const trigger = channel.threshold
      ? channel.threshold.process(value, Date.now())
      : null;

    return { continuous: value, trigger, note };
  }

  getChannelConfig(index: number): ChannelConfig | undefined {
    return this.channels[index]?.config;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
