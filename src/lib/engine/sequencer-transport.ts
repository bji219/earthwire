import { BpmClock } from './clock.js';
import type { BeatSubdivision } from '../nodes/types.js';
import type { SequencerSource } from '../sources/sequencer-source.js';
import { log } from '../util/logger.js';

export class SequencerTransport {
	private clock: BpmClock;
	private sourceRates: Map<SequencerSource, { rate: number; accumulator: number }> = new Map();
	private timerId: ReturnType<typeof setTimeout> | null = null;
	private lastTickTime = 0;
	private tickCount = 0;
	private _playing = false;
	private _subdivision: BeatSubdivision = '1/16';
	private _swing = 0; // 0-1 range (0 = straight, 1 = max swing)

	constructor(clock: BpmClock) {
		this.clock = clock;
	}

	get playing(): boolean {
		return this._playing;
	}

	get sources(): Iterable<SequencerSource> {
		return this.sourceRates.keys();
	}

	registerSource(source: SequencerSource, rate = 1): void {
		this.sourceRates.set(source, { rate, accumulator: 0 });
	}

	unregisterSource(source: SequencerSource): void {
		this.sourceRates.delete(source);
	}

	setSourceRate(source: SequencerSource, rate: number): void {
		const entry = this.sourceRates.get(source);
		if (entry) {
			entry.rate = rate;
		}
	}

	setSubdivision(sub: BeatSubdivision): void {
		this._subdivision = sub;
	}

	setSwing(percent: number): void {
		this._swing = Math.max(0, Math.min(100, percent)) / 100;
	}

	play(): void {
		if (this._playing) return;
		log.transport(`play: starting, ${this.sourceRates.size} sources registered`);
		this._playing = true;
		this.lastTickTime = performance.now();
		this.scheduleTick();
	}

	pause(): void {
		log.transport('pause');
		this._playing = false;
		if (this.timerId !== null) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
	}

	stop(): void {
		log.transport('stop: resetting');
		this.pause();
		this.tickCount = 0;
		for (const source of this.sourceRates.keys()) {
			source.reset();
		}
		// Reset accumulators
		for (const state of this.sourceRates.values()) {
			state.accumulator = 0;
		}
	}

	destroy(): void {
		this.pause();
		this.sourceRates.clear();
	}

	private getTickIntervalMs(): number {
		const baseMs = this.clock.subdivisionMs(this._subdivision);
		if (!baseMs) return 500; // fallback

		if (this._swing === 0) return baseMs;

		// Swing: alternate between shorter and longer intervals
		const isOddTick = this.tickCount % 2 === 1;
		if (isOddTick) {
			// Odd ticks are delayed (swing pushes them later)
			return baseMs * (1 + this._swing * 0.5);
		} else {
			// Even ticks are earlier to compensate
			return baseMs * (1 - this._swing * 0.5);
		}
	}

	private scheduleTick(): void {
		if (!this._playing) return;

		const intervalMs = this.getTickIntervalMs();
		const now = performance.now();
		const drift = now - this.lastTickTime - intervalMs;
		const nextDelay = Math.max(1, intervalMs - (drift > 0 ? drift : 0));

		this.timerId = setTimeout(() => {
			this.lastTickTime = performance.now();

			for (const [source, state] of this.sourceRates) {
				state.accumulator += state.rate;
				while (state.accumulator >= 1) {
					source.tick();
					state.accumulator -= 1;
				}
			}
			this.tickCount++;

			if (this.tickCount % 100 === 0) {
				log.transport(`tick #${this.tickCount}, interval=${intervalMs.toFixed(1)}ms, sources=${this.sourceRates.size}`);
			}

			this.scheduleTick();
		}, nextDelay);
	}
}
