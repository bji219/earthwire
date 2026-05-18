import type { SourceRegistry } from '../sources/registry.js';
import type { EarthwireSource } from '../sources/types.js';
import type { ChannelConfig, ChannelOutput, OutputConfig } from './types.js';
import type { EarthwireEngine } from './engine.js';
import type { SequencerTransport } from './sequencer-transport.js';
import type { DemoSynth } from '../outputs/demo-synth.js';
import type { MidiOutput } from '../outputs/midi.js';
import type { CvOutput } from '../outputs/cv-output.js';
import { SequencerSource } from '../sources/sequencer-source.js';
import { shapeValue } from '../nodes/lfo.js';
import { log } from '../util/logger.js';

export type SignalCallback = (
	index: number,
	rawValue: number,
	output: ChannelOutput,
	config: ChannelConfig
) => void;

export type SourceAcquiredCallback = (source: EarthwireSource) => void;
export type SourceReleasedCallback = (sourceId: string) => void;

interface ChannelWire {
	sourceId: string;
	fieldId: string;
	timeRange?: string;
	locationKey?: string;
	tickRate?: number;
	unsubscribe: (() => void) | null;
	generation: number;
}

export class ChannelWiringManager {
	private wires: ChannelWire[] = [];
	private generation = 0;
	private syncing = false;
	// Track last note per channel index for proper note-off
	private lastNotes: Map<number, { port: string; channel: number; note: number }> = new Map();

	constructor(
		private registry: SourceRegistry,
		private engine: EarthwireEngine,
		private synth: DemoSynth | null,
		private midi: MidiOutput | null,
		private cv: CvOutput | null,
		private onSignal?: SignalCallback,
		private onSourceAcquired?: SourceAcquiredCallback,
		private onSourceReleased?: SourceReleasedCallback,
		private getSelectedMidiPort?: () => string,
		private transport?: SequencerTransport | null
	) {}

	async syncChannels(channels: ChannelConfig[]): Promise<void> {
		if (this.syncing) return;
		this.syncing = true;

		try {
			this.generation++;
			log.wiring(`syncChannels: ${channels.length} channels, generation=${this.generation}`);
			const gen = this.generation;

			// Sync engine channels
			this.engine.syncChannels(channels);

			// Remove excess wires
			while (this.wires.length > channels.length) {
				const wire = this.wires.pop()!;
				wire.unsubscribe?.();
				if (wire.sourceId !== 'lfo') this.registry.release(wire.sourceId);
			}

			// Update or create wires
			for (let i = 0; i < channels.length; i++) {
				const config = channels[i];
				const existing = this.wires[i];

				if (existing && existing.sourceId === config.sourceId && existing.fieldId === config.fieldId) {
					// Same source+field — check if timeRange, location, or tickRate changed
					const source = this.registry.getSource(config.sourceId);
					if (config.timeRange && existing.timeRange !== config.timeRange) {
						existing.timeRange = config.timeRange;
						if (source && source instanceof SequencerSource) {
							source.setTimeRange(config.timeRange);
						}
					}
					const locKey = config.location ? JSON.stringify(config.location) : undefined;
					if (locKey !== existing.locationKey) {
						existing.locationKey = locKey;
						if (source && source instanceof SequencerSource) {
							source.setLocation(config.location);
						}
					}
					const newRate = config.tickRate ?? 1;
					if (newRate !== (existing.tickRate ?? 1)) {
						existing.tickRate = newRate;
						if (source && source instanceof SequencerSource && this.transport) {
							this.transport.setSourceRate(source, newRate);
						}
					}
					continue;
				}

				// Tear down old wire if it exists
				if (existing) {
					existing.unsubscribe?.();
					this.onSourceReleased?.(existing.sourceId);
					if (existing.sourceId !== 'lfo') this.registry.release(existing.sourceId);
				}

				// Create new wire
				const wire: ChannelWire = {
					sourceId: config.sourceId,
					fieldId: config.fieldId,
					unsubscribe: null,
					generation: gen
				};

				if (i < this.wires.length) {
					this.wires[i] = wire;
				} else {
					this.wires.push(wire);
				}

				// Acquire source and subscribe (async)
				this.connectWire(i, wire, config).catch(() => {
					// Source unavailable — wire stays disconnected
				});
			}
		} finally {
			this.syncing = false;
		}
	}

	private async connectWire(index: number, wire: ChannelWire, config?: ChannelConfig): Promise<void> {
		const gen = wire.generation;

		log.wiring(`connectWire[${index}]: acquiring source=${wire.sourceId} field=${wire.fieldId}`);

		// LFO source: bypass registry — run a per-channel setInterval timer
		if (wire.sourceId === 'lfo') {
			const lfoConfig = config?.lfoConfig ?? { shape: 'sine' as const, rate: 1 };
			// Update at ~60 fps; for rates above 15 Hz use at least 4 samples/cycle
			const intervalMs = Math.max(16, Math.round(1000 / (lfoConfig.rate * 8)));
			let phase = 0;
			let lastTick = Date.now();

			const timer = setInterval(() => {
				const now = Date.now();
				const dt = (now - lastTick) / 1000;
				lastTick = now;
				phase = (phase + dt * lfoConfig.rate) % 1;
				const rawValue = shapeValue(lfoConfig.shape, phase);

				const channelConfig = this.engine.getChannelConfig(index);
				if (!channelConfig) return;
				const output = this.engine.processValue(index, rawValue);
				this.dispatchOutput(index, channelConfig.output, output);
				this.onSignal?.(index, rawValue, output, channelConfig);
			}, intervalMs);

			wire.unsubscribe = () => clearInterval(timer);
			return;
		}

		let source: EarthwireSource;
		try {
			source = await this.registry.acquire(wire.sourceId);
		} catch (err) {
			log.warn(`connectWire[${index}]: failed to acquire ${wire.sourceId}: ${err}`);
			return;
		}

		// Stale — a newer sync happened while we were awaiting
		if (this.generation !== gen || this.wires[index] !== wire) {
			log.wiring(`connectWire[${index}]: stale (gen ${gen} vs ${this.generation}), releasing`);
			this.registry.release(wire.sourceId);
			return;
		}

		// Set initial location on the source if provided
		if (config?.location && source instanceof SequencerSource) {
			wire.locationKey = JSON.stringify(config.location);
			source.setLocation(config.location);
		}

		// Register with transport at the channel's tick rate
		if (source instanceof SequencerSource && this.transport) {
			const rate = config?.tickRate ?? 1;
			wire.tickRate = rate;
			this.transport.registerSource(source, rate);
		}

		log.wiring(`connectWire[${index}]: source acquired, subscribing`);
		this.onSourceAcquired?.(source);

		const unsub = source.onUpdate((update) => {
			// Read current config from engine (always up-to-date via syncChannels)
			const config = this.engine.getChannelConfig(index);
			if (!config) return;
			if (update.fieldId !== config.fieldId) return;

			const output = this.engine.processValue(index, update.value);
			this.dispatchOutput(index, config.output, output);
			this.onSignal?.(index, update.value, output, config);
		});

		wire.unsubscribe = unsub;
	}

	/** Send All Notes Off on all MIDI channels and clear tracked notes */
	panic(): void {
		if (!this.midi) return;
		const port = this.getSelectedMidiPort?.() || '';

		// Send note-off for all tracked notes
		for (const [, info] of this.lastNotes) {
			this.midi.sendNoteOff(info.port, info.channel, info.note);
		}
		this.lastNotes.clear();

		// Send All Notes Off (CC 123) on channels 1-16
		for (let ch = 1; ch <= 16; ch++) {
			this.midi.sendCc(port, ch, 123, 0);
		}
	}

	destroy(): void {
		this.panic();
		for (const wire of this.wires) {
			wire.unsubscribe?.();
			if (wire.sourceId !== 'lfo') this.registry.release(wire.sourceId);
		}
		this.wires = [];
	}

	private dispatchOutput(channelIndex: number, config: OutputConfig, output: ChannelOutput): void {
		switch (config.type) {
			case 'demo-synth':
				if (!this.synth) return;
				switch (config.param) {
					case 'filter-cutoff':
						this.synth.setFilterCutoff(output.continuous);
						break;
					case 'filter-resonance':
						this.synth.setFilterResonance(output.continuous);
						break;
					case 'osc-pitch':
						this.synth.setOscPitch(output.continuous);
						break;
					case 'osc-detune':
						this.synth.setOscDetune(output.continuous);
						break;
					case 'reverb-mix':
						this.synth.setReverbMix(output.continuous);
						break;
					case 'drum-trigger':
						if (output.trigger) this.synth.triggerDrum();
						break;
				}
				break;
			case 'midi-cc': {
				if (!this.midi) return;
				const port = config.port || this.getSelectedMidiPort?.() || '';
				this.midi.sendCc(port, config.channel, config.cc, output.continuous);
				break;
			}
			case 'midi-note': {
				if (!this.midi) return;
				const port = config.port || this.getSelectedMidiPort?.() || '';

				// Send note-off for previous note on this channel
				const prev = this.lastNotes.get(channelIndex);
				if (prev) {
					this.midi.sendNoteOff(prev.port, prev.channel, prev.note);
					this.lastNotes.delete(channelIndex);
				}

				if (output.note !== null) {
					this.midi.sendNoteOn(port, config.channel, output.note, 100);
					this.lastNotes.set(channelIndex, { port, channel: config.channel, note: output.note });
				}
				break;
			}
			case 'midi-trigger': {
				if (!this.midi || !output.trigger) return;
				const port = config.port || this.getSelectedMidiPort?.() || '';
				const note = config.note;
				const ch = config.channel;
				this.midi.sendNoteOn(port, ch, note, Math.round(output.trigger.velocity * 127));
				// Auto note-off after 100ms
				const midi = this.midi;
				setTimeout(() => {
					midi.sendNoteOff(port, ch, note);
				}, 100);
				break;
			}
			case 'cv': {
				if (!this.cv) return;
				this.cv.setValue(config.audioChannel, output.continuous);
				break;
			}
		}
	}
}
