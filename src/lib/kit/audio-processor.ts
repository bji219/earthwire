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
 * Extract peak amplitude values from a subrange of an AudioBuffer.
 * `startSec` and `endSec` are in seconds; returns `numBars` values in 0..1.
 */
export function extractPeaksRange(
  buffer: AudioBuffer,
  numBars: number,
  startSec: number,
  endSec: number
): number[] {
  const channelData = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const startSample = Math.floor(startSec * sr);
  const endSample = Math.min(Math.ceil(endSec * sr), channelData.length);
  const rangeLength = endSample - startSample;
  if (rangeLength <= 0) return new Array(numBars).fill(0);

  const blockSize = Math.max(1, Math.floor(rangeLength / numBars));
  const peaks: number[] = [];
  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = startSample + i * blockSize;
    const end = Math.min(start + blockSize, endSample);
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(channelData[j] ?? 0));
    }
    peaks.push(max);
  }
  return peaks;
}

/**
 * Convert peaks to a closed SVG path for a symmetric filled waveform.
 * Traces the positive envelope left→right, then the negative envelope right→left.
 */
export function peaksToSvgPath(
  peaks: number[],
  width: number,
  height: number
): string {
  if (peaks.length === 0) return '';
  const n = peaks.length;
  const mid = height / 2;
  const scale = mid * 0.88;

  // Top envelope: left → right
  const top = peaks.map((p, i) => {
    const x = (i / (n - 1)) * width;
    const y = mid - p * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Bottom envelope: right → left (mirror)
  const bottom = peaks.slice().reverse().map((p, i) => {
    const x = ((n - 1 - i) / (n - 1)) * width;
    const y = mid + p * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M${top.join(' L')} L${bottom.join(' L')} Z`;
}

/**
 * Decode an audio file ArrayBuffer, with a pure-JS AIFF fallback for browsers
 * (Chrome) that don't natively support AIFF/AIFF-C in decodeAudioData.
 */
export async function decodeAudioData(
  arrayBuffer: ArrayBuffer,
  ctx: AudioContext
): Promise<AudioBuffer> {
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    // Fallback: try JS AIFF parser
    return decodeAiff(arrayBuffer, ctx);
  }
}

function readStr(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

// Parse the 80-bit IEEE 754 extended float used for AIFF sample rates
function read80Float(view: DataView, offset: number): number {
  const exponent = (view.getUint16(offset, false) & 0x7fff) - 16383;
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  return (hi * 0x100000000 + lo) * Math.pow(2, exponent - 63);
}

function decodeAiff(buffer: ArrayBuffer, ctx: AudioContext): AudioBuffer {
  const view = new DataView(buffer);
  if (readStr(view, 0, 4) !== 'FORM') throw new Error('Not a valid AIFF/AIFF-C file');
  const formType = readStr(view, 8, 4);
  const isAifc = formType === 'AIFC';
  if (formType !== 'AIFF' && !isAifc) throw new Error(`Unsupported FORM type: ${formType}`);

  let numChannels = 0;
  let numFrames = 0;
  let bitDepth = 0;
  let sampleRate = 0;
  let soundDataOffset = 0;
  let compressionType = 'NONE';

  const fileEnd = 8 + view.getUint32(4, false);
  let pos = 12;

  while (pos + 8 <= fileEnd) {
    const chunkId = readStr(view, pos, 4);
    const chunkSize = view.getUint32(pos + 4, false);
    const chunkStart = pos + 8;
    pos = chunkStart + chunkSize + (chunkSize & 1); // pad to even

    if (chunkId === 'COMM') {
      numChannels = view.getInt16(chunkStart, false);
      numFrames   = view.getUint32(chunkStart + 2, false);
      bitDepth    = view.getInt16(chunkStart + 6, false);
      sampleRate  = read80Float(view, chunkStart + 8);
      if (isAifc && chunkSize >= 22) {
        compressionType = readStr(view, chunkStart + 18, 4);
      }
    } else if (chunkId === 'SSND') {
      const ssndOffset = view.getUint32(chunkStart, false);
      soundDataOffset  = chunkStart + 8 + ssndOffset;
    }
  }

  if (compressionType !== 'NONE' && compressionType !== 'raw ' && compressionType !== 'twos') {
    throw new Error(`Unsupported AIFF-C compression: "${compressionType}". Only uncompressed PCM is supported.`);
  }

  if (!sampleRate || !numFrames || !numChannels) throw new Error('AIFF COMM chunk missing or corrupt');

  const audioBuffer = ctx.createBuffer(numChannels, numFrames, sampleRate);
  const bytesPerSample = Math.ceil(bitDepth / 8);
  const frameStride = bytesPerSample * numChannels;

  for (let ch = 0; ch < numChannels; ch++) {
    const out = audioBuffer.getChannelData(ch);
    for (let f = 0; f < numFrames; f++) {
      const bytePos = soundDataOffset + f * frameStride + ch * bytesPerSample;
      let s = 0;
      if (bitDepth === 16) {
        s = view.getInt16(bytePos, false) / 32768;
      } else if (bitDepth === 24) {
        const b0 = view.getUint8(bytePos);
        const b1 = view.getUint8(bytePos + 1);
        const b2 = view.getUint8(bytePos + 2);
        let v = (b0 << 16) | (b1 << 8) | b2;
        if (v & 0x800000) v -= 0x1000000;
        s = v / 8388608;
      } else if (bitDepth === 32) {
        s = view.getInt32(bytePos, false) / 2147483648;
      }
      out[f] = s;
    }
  }

  return audioBuffer;
}

/**
 * Trim an AudioBuffer to [trimStart, trimEnd] seconds, downmix to `numChannels`,
 * and resample to `targetSampleRate`.
 *
 * Pure JS implementation using getChannelData() with linear interpolation —
 * avoids OfflineAudioContext which produces silence for remotely-decoded MP3 buffers
 * when the browser's AudioContext sample rate (typically 48 kHz on macOS) differs
 * from the export target rate (44100 Hz).
 */
export function trimBuffer(
  source: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  numChannels: number,
  targetSampleRate: number
): AudioBuffer {
  const duration = trimEnd - trimStart;
  if (duration <= 0) throw new Error('Trim duration must be > 0');

  const sourceSR = source.sampleRate;
  const startFrame = Math.round(trimStart * sourceSR);
  const targetFrames = Math.max(1, Math.round(duration * targetSampleRate));
  // ratio: how many source frames to advance per output frame
  const ratio = sourceSR / targetSampleRate;

  const output = new AudioBuffer({
    numberOfChannels: numChannels,
    length: targetFrames,
    sampleRate: targetSampleRate,
  });

  const stereoToMono = numChannels === 1 && source.numberOfChannels >= 2;

  if (stereoToMono) {
    const srcL = source.getChannelData(0);
    const srcR = source.getChannelData(1);
    const dst = output.getChannelData(0);
    for (let i = 0; i < targetFrames; i++) {
      const pos = startFrame + i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const L = (srcL[idx] ?? 0) + ((srcL[idx + 1] ?? 0) - (srcL[idx] ?? 0)) * frac;
      const R = (srcR[idx] ?? 0) + ((srcR[idx + 1] ?? 0) - (srcR[idx] ?? 0)) * frac;
      dst[i] = (L + R) * 0.5;
    }
  } else {
    for (let ch = 0; ch < numChannels; ch++) {
      const srcCh = ch < source.numberOfChannels ? ch : 0;
      const src = source.getChannelData(srcCh);
      const dst = output.getChannelData(ch);
      for (let i = 0; i < targetFrames; i++) {
        const pos = startFrame + i * ratio;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        dst[i] = (src[idx] ?? 0) + ((src[idx + 1] ?? 0) - (src[idx] ?? 0)) * frac;
      }
    }
  }

  return output;
}

/**
 * Peak-normalize an AudioBuffer in place so the loudest sample hits targetPeak.
 * Each slot in the kit may come from sources at very different amplitude levels
 * (e.g. Freesound previews peak around −15 dBFS vs local files at 0 dBFS).
 * This ensures all slots are perceptually consistent in the exported kit.
 */
export function normalizeBuffer(buf: AudioBuffer, targetPeak = 0.9): void {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak < 0.0001) return; // silence — don't amplify noise floor
  const gain = targetPeak / peak;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

/**
 * Clone an AudioBuffer into a fresh, JS-heap-owned copy.
 * Chrome's decodeAudioData may back MP3/OGG buffers with native memory that
 * gets recycled after the audio subsystem drops the reference. Cloning
 * immediately after decode guarantees getChannelData() stays valid indefinitely.
 */
export function cloneAudioBuffer(source: AudioBuffer): AudioBuffer {
  const clone = new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate,
  });
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    clone.getChannelData(ch).set(source.getChannelData(ch));
  }
  return clone;
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
