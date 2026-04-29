export interface EarthwireSource {
	id: string;
	name: string;
	icon: string;
	description: string;
	attribution: SourceAttribution;
	fields: SourceField[];
	connect(): Promise<void>;
	disconnect(): void;
	onUpdate(cb: (update: SourceUpdate) => void): () => void;
}

export interface SourceField {
	id: string;
	name: string;
	unit: string;
	expectedRange: [number, number];
}

export interface SourceUpdate {
	timestamp: number;
	fieldId: string;
	value: number;
	raw: unknown;
}

export interface SourceAttribution {
	provider: string;
	license: string;
	url: string;
}

export type TimeRangePreset = 'hour' | 'day' | 'week' | 'month';

export interface SequencerState {
	bufferLength: number;
	cursor: number;
	loading: boolean;
	timeRange: TimeRangePreset;
}
