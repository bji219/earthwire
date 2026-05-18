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
        this.updateChannel(i, configs[i]);
      }
    }
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
