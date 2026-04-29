import { log } from '../util/logger.js';

/**
 * Map normalized 0–1 to audio amplitude -1..+1.
 * Requires a DC-coupled audio interface (e.g. Expert Sleepers ES-9, MOTU, Focusrite Scarlett Gen 3+).
 * At full interface output gain, -1..+1 maps to ±5V Eurorack CV range.
 */
export function normalizedToVoltage(value: number): number {
	return value * 2 - 1;
}

export class CvOutput {
	private ctx: AudioContext | null = null;
	private merger: ChannelMergerNode | null = null;
	private sources: Map<number, ConstantSourceNode> = new Map();
	private maxChannels = 0;

	async init(): Promise<boolean> {
		try {
			this.ctx = new AudioContext({ sampleRate: 48000 });

			this.maxChannels = Math.min(this.ctx.destination.maxChannelCount, 16);
			if (this.maxChannels < 1) {
				log.warn('CvOutput: no output channels available');
				return false;
			}

			this.ctx.destination.channelCount = this.maxChannels;
			this.ctx.destination.channelInterpretation = 'discrete';

			this.merger = this.ctx.createChannelMerger(this.maxChannels);
			this.merger.connect(this.ctx.destination);

			log.source(`CvOutput: initialized with ${this.maxChannels} channels`);
			return true;
		} catch (err) {
			log.warn(`CvOutput: init failed: ${err}`);
			return false;
		}
	}

	get channelCount(): number {
		return this.maxChannels;
	}

	setValue(audioChannel: number, normalizedValue: number): void {
		if (!this.ctx || !this.merger) return;
		if (audioChannel < 0 || audioChannel >= this.maxChannels) return;

		const voltage = normalizedToVoltage(normalizedValue);

		let source = this.sources.get(audioChannel);
		if (!source) {
			source = this.ctx.createConstantSource();
			source.offset.value = voltage;
			source.connect(this.merger, 0, audioChannel);
			source.start();
			this.sources.set(audioChannel, source);
		} else {
			source.offset.setTargetAtTime(voltage, this.ctx.currentTime, 0.005);
		}
	}

	destroy(): void {
		for (const source of this.sources.values()) {
			source.stop();
			source.disconnect();
		}
		this.sources.clear();
		this.merger?.disconnect();
		this.merger = null;
		this.ctx?.close();
		this.ctx = null;
		this.maxChannels = 0;
	}
}
