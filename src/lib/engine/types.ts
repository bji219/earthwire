import type { NormalizerConfig, SmootherConfig, QuantizerConfig, ThresholdConfig, LFOConfig } from '../nodes/types.js';
import type { TimeRangePreset } from '../sources/types.js';

export interface LocationConfig {
	lat: number;
	lng: number;
	radiusKm: number;
	region?: string;
}

export interface ChannelConfig {
	sourceId: string;
	fieldId: string;
	timeRange?: TimeRangePreset;
	location?: LocationConfig;
	tickRate?: number; // clock multiplier: 0.25–4.0 (default 1.0 = 100%)
	normalizer: NormalizerConfig;
	lfo: LFOConfig | null;
	smoother: SmootherConfig | null;
	quantizer: QuantizerConfig | null;
	threshold: ThresholdConfig | null;
	output: OutputConfig;
}

export type OutputConfig =
	| { type: 'midi-cc'; channel: number; cc: number; port?: string }
	| { type: 'midi-note'; channel: number; port?: string }
	| { type: 'midi-trigger'; channel: number; note: number; port?: string }
	| { type: 'cv'; audioChannel: number }
	| { type: 'osc'; address?: string }
	| { type: 'demo-synth'; param: DemoSynthParam };

export type DemoSynthParam = 'filter-cutoff' | 'filter-resonance' | 'osc-pitch' | 'osc-detune' | 'drum-trigger' | 'reverb-mix';

export interface PatchConfig {
	id: string;
	name: string;
	specVersion: string;
	bpm: number;
	channels: ChannelConfig[];
}

export interface SignalValue {
	value: number;
	timestamp: number;
}

export interface TriggerEvent {
	timestamp: number;
	velocity: number;
}

export interface ChannelOutput {
	continuous: number;
	trigger: TriggerEvent | null;
	note: number | null;
}
