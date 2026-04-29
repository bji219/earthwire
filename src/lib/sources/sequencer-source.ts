import type {
	EarthwireSource,
	SourceField,
	SourceAttribution,
	SourceUpdate,
	TimeRangePreset,
	SequencerState
} from './types.js';
import type { LocationConfig } from '../engine/types.js';
import { log } from '../util/logger.js';

export interface BufferedEvent {
	timestamp: number;
	updates: SourceUpdate[];
}

export type FetchBufferFn = (timeRange: TimeRangePreset, location?: LocationConfig) => Promise<SourceUpdate[]>;

interface SequencerSourceOptions {
	id: string;
	name: string;
	icon: string;
	description: string;
	attribution: SourceAttribution;
	fields: SourceField[];
	fetchBuffer: FetchBufferFn;
}

export class SequencerSource implements EarthwireSource {
	readonly id: string;
	readonly name: string;
	readonly icon: string;
	readonly description: string;
	readonly attribution: SourceAttribution;
	readonly fields: SourceField[];

	private fetchBuffer: FetchBufferFn;
	private listeners = new Set<(update: SourceUpdate) => void>();
	private _buffer: BufferedEvent[] = [];
	private _cursor = 0;
	private _loading = false;
	private _timeRange: TimeRangePreset = 'day';
	private _location?: LocationConfig;

	constructor(opts: SequencerSourceOptions) {
		this.id = opts.id;
		this.name = opts.name;
		this.icon = opts.icon;
		this.description = opts.description;
		this.attribution = opts.attribution;
		this.fields = opts.fields;
		this.fetchBuffer = opts.fetchBuffer;
	}

	get buffer(): BufferedEvent[] {
		return this._buffer;
	}

	get cursor(): number {
		return this._cursor;
	}

	async connect(): Promise<void> {
		await this.loadBuffer(this._timeRange);
	}

	disconnect(): void {
		this._buffer = [];
		this._cursor = 0;
		this.listeners.clear();
	}

	onUpdate(cb: (update: SourceUpdate) => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	tick(): void {
		if (this._buffer.length === 0) return;

		const event = this._buffer[this._cursor];
		for (const update of event.updates) {
			for (const cb of this.listeners) cb(update);
		}

		this._cursor++;
		if (this._cursor >= this._buffer.length) {
			this._cursor = 0; // loop
		}

		// Log every 50th tick to avoid spam
		if (this._cursor % 50 === 0) {
			log.source(`${this.id} tick: cursor=${this._cursor}/${this._buffer.length}`);
		}
	}

	reset(): void {
		this._cursor = 0;
	}

	async setTimeRange(range: TimeRangePreset): Promise<void> {
		this._timeRange = range;
		await this.loadBuffer(range);
	}

	async setLocation(location?: LocationConfig): Promise<void> {
		const changed = JSON.stringify(this._location) !== JSON.stringify(location);
		this._location = location;
		if (changed) {
			log.source(`${this.id} setLocation: ${JSON.stringify(location)}`);
			await this.loadBuffer(this._timeRange);
		}
	}

	getState(): SequencerState {
		return {
			bufferLength: this._buffer.length,
			cursor: this._cursor,
			loading: this._loading,
			timeRange: this._timeRange
		};
	}

	private async loadBuffer(timeRange: TimeRangePreset): Promise<void> {
		this._loading = true;
		log.source(`${this.id} loadBuffer: timeRange=${timeRange}`);
		try {
			const updates = await this.fetchBuffer(timeRange, this._location);
			this._buffer = groupByTimestamp(updates);
			this._cursor = 0;
			log.source(`${this.id} loadBuffer complete: ${updates.length} updates → ${this._buffer.length} buffer events`);
		} catch (err) {
			log.warn(`${this.id} loadBuffer error: ${err}`);
		} finally {
			this._loading = false;
		}
	}
}

function groupByTimestamp(updates: SourceUpdate[]): BufferedEvent[] {
	const map = new Map<number, SourceUpdate[]>();

	for (const u of updates) {
		const existing = map.get(u.timestamp);
		if (existing) {
			existing.push(u);
		} else {
			map.set(u.timestamp, [u]);
		}
	}

	return Array.from(map.entries())
		.sort(([a], [b]) => a - b)
		.map(([timestamp, eventUpdates]) => ({ timestamp, updates: eventUpdates }));
}
