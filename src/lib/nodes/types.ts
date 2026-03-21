export interface NormalizerConfig {
	mode: 'auto' | 'manual';
	windowSeconds?: number;
	min?: number;
	max?: number;
}

export interface SmootherConfig {
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
export type BeatSubdivision = '1/4' | '1/8' | '1/16' | null;

export interface ThresholdConfig {
	level: number;
	direction: ThresholdDirection;
	beatQuantize: BeatSubdivision;
}
