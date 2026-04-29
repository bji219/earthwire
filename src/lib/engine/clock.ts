import type { BeatSubdivision } from '../nodes/types.js';

export class BpmClock {
  private _bpm: number;
  startTime: number = 0;

  constructor(bpm: number = 120) {
    this._bpm = bpm;
  }

  get bpm(): number {
    return this._bpm;
  }

  set bpm(value: number) {
    this._bpm = Math.max(1, Math.min(300, value));
  }

  get beatDurationMs(): number {
    return 60_000 / this._bpm;
  }

  subdivisionMs(subdivision: BeatSubdivision): number | null {
    if (subdivision === null) return null;
    const beat = this.beatDurationMs;
    switch (subdivision) {
      case '1/4': return beat;
      case '1/8': return beat / 2;
      case '1/16': return beat / 4;
      case '1/32': return beat / 8;
      case '1/4T': return beat / 1.5;
      case '1/8T': return beat / 3;
      case '1/16T': return beat / 6;
      default: return beat / 4; // fallback to 1/16
    }
  }

  quantize(timestamp: number, subdivision: BeatSubdivision): number {
    const subMs = this.subdivisionMs(subdivision);
    if (subMs === null) return timestamp;
    const elapsed = timestamp - this.startTime;
    const beats = Math.round(elapsed / subMs);
    return this.startTime + beats * subMs;
  }
}
