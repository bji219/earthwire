import { createNormalizer, type Normalizer } from '../nodes/normalizer.js';
import { createSmoother, type Smoother } from '../nodes/smoother.js';
import type { ChannelConfig, ChannelOutput } from './types.js';

interface ChannelState {
  config: ChannelConfig;
  normalizer: Normalizer;
  smoother: Smoother | null;
}

export class EarthwireEngine {
  private channels: ChannelState[] = [];

  get channelCount(): number {
    return this.channels.length;
  }

  addChannel(config: ChannelConfig): void {
    const normalizer = createNormalizer(config.normalizer);
    const smoother = config.smoother ? createSmoother(config.smoother) : null;
    this.channels.push({ config, normalizer, smoother });
  }

  removeChannel(index: number): void {
    this.channels.splice(index, 1);
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
    return { continuous: value, trigger: null, note: null };
  }

  getChannelConfig(index: number): ChannelConfig | undefined {
    return this.channels[index]?.config;
  }
}
