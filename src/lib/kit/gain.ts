// Per-slot gain, baked into the exported audio rather than written to the
// OP-1 APPL `volume` array — same reasoning as pitch.ts: that array's encoding
// is unverified, and baking keeps preview and export identical.
//
// Levels are genuinely uneven without this. normalizeBuffer() runs on every
// slot at export but only lifts *quiet* samples, bailing when peak > 0.5, so
// anything already loud passes through untouched.

export const GAIN_MIN_DB = -24;
export const GAIN_MAX_DB = 6;
export const GAIN_DEFAULT_DB = 0;

export function clampGainDb(db: number): number {
  if (!Number.isFinite(db)) return GAIN_DEFAULT_DB;
  return Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, Math.round(db)));
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

/**
 * Scale every sample in place. Deliberately does not clamp: the encoder already
 * clamps to +/-1.0 when converting to 16-bit, so a boost hard-clips rather than
 * wrapping, and clamping here too would just cost a second pass.
 */
export function applyGain(buffer: AudioBuffer, db: number): void {
  if (db === 0) return;
  const factor = dbToLinear(db);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= factor;
  }
}
