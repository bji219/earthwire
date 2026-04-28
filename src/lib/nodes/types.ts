export interface NormalizerConfig {
	mode: 'auto' | 'manual';
	windowSeconds?: number;
	min?: number;
	max?: number;
}

export type SmootherMode = 'smooth' | 'deep-smooth' | 'glide' | 'step';

export interface SmootherConfig {
	mode?: SmootherMode;
	amount: number;
}

export type ScaleName =
	| 'chromatic'
	| 'major'
	| 'minor'
	| 'pentatonic'
	| 'blues'
	| 'dorian'
	| 'mixolydian';

export interface QuantizerConfig {
	root: number;
	scale: ScaleName;
}

export type ThresholdDirection = 'rising' | 'falling' | 'both';
export type BeatSubdivision = '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T' | null;

export interface ThresholdConfig {
	level: number;
	direction: ThresholdDirection;
	beatQuantize: BeatSubdivision;
}

export type LFOShape = 'sine' | 'triangle' | 'square' | 'saw' | 'rsaw';

export interface LFOConfig {
	shape: LFOShape;
	/** Frequency in Hz. */
	rate: number;
	/** 0 = passthrough (pure env data), 1 = pure LFO. */
	depth: number;
}
