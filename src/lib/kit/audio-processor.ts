/**
 * Extract peak amplitude values from an AudioBuffer for waveform rendering.
 * Returns an array of `numBars` values in 0..1 range.
 */
export function extractPeaks(buffer: AudioBuffer, numBars: number): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / numBars);
  const peaks: number[] = [];
  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      max = Math.max(max, Math.abs(channelData[start + j] ?? 0));
    }
    peaks.push(max);
  }
  return peaks;
}

/**
 * Convert peaks array to an SVG polyline path string.
 * Draws a center-line waveform (amplitude reflected above and below).
 */
export function peaksToSvgPath(
  peaks: number[],
  width: number,
  height: number
): string {
  if (peaks.length === 0) return '';
  const mid = height / 2;
  return peaks
    .map((peak, i) => {
      const x = (i / Math.max(peaks.length - 1, 1)) * width;
      const y = mid - peak * mid * 0.9;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Trim an AudioBuffer to [trimStart, trimEnd] seconds using OfflineAudioContext.
 * Downmixes to `numChannels` output channels.
 */
export async function trimBuffer(
  source: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  numChannels: number,
  sampleRate: number
): Promise<AudioBuffer> {
  const duration = trimEnd - trimStart;
  const frameCount = Math.round(duration * sampleRate);
  if (frameCount <= 0) throw new Error('Trim duration must be > 0');

  const ctx = new OfflineAudioContext(numChannels, frameCount, sampleRate);
  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = source;
  bufferSource.connect(ctx.destination);
  bufferSource.start(0, trimStart, duration);

  return ctx.startRendering();
}

/**
 * Stitch an array of AudioBuffers into one interleaved Float32Array.
 * Empty slots (null) contribute silence for 0 frames (skipped).
 */
export function stitchBuffers(
  buffers: (AudioBuffer | null)[],
  numChannels: number
): Float32Array {
  const totalFrames = buffers.reduce(
    (sum, b) => sum + (b ? b.length : 0),
    0
  );
  const out = new Float32Array(totalFrames * numChannels);
  let cursor = 0;

  for (const buf of buffers) {
    if (!buf) continue;
    for (let frame = 0; frame < buf.length; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const srcCh = ch < buf.numberOfChannels ? ch : 0; // downmix
        out[cursor++] = buf.getChannelData(srcCh)[frame];
      }
    }
  }
  return out;
}
