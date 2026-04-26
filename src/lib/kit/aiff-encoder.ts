export interface AiffOptions {
  sampleRate: number;
  numChannels: number;
  bitDepth: number;
  samples: Float32Array;  // interleaved, -1..1
  applJson: string;       // null-terminated JSON from buildOp1Metadata()
}

// 80-bit IEEE 754 extended for common sample rates
const SAMPLE_RATE_BYTES: Record<number, number[]> = {
  44100: [0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  48000: [0x40, 0x0E, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

function convertSamples(samples: Float32Array, bitDepth: number): Uint8Array {
  const bytesPerSample = bitDepth / 8;
  const out = new Uint8Array(samples.length * bytesPerSample);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    if (bitDepth === 16) {
      const val = Math.round(clamped * 32767);
      view.setInt16(i * 2, val, false);
    } else {
      // 24-bit big-endian
      const val = clamped < 0
        ? Math.round(clamped * 8388608)
        : Math.round(clamped * 8388607);
      const o = i * 3;
      out[o]     = (val >> 16) & 0xFF;
      out[o + 1] = (val >> 8)  & 0xFF;
      out[o + 2] =  val        & 0xFF;
    }
  }
  return out;
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

export function encodeAiff(opts: AiffOptions): Uint8Array {
  const { sampleRate, numChannels, bitDepth, samples, applJson } = opts;
  const numFrames = Math.floor(samples.length / numChannels);

  // SSND sample data
  const pcmData = convertSamples(samples, bitDepth);

  // APPL payload: "op-1" (4 bytes) + JSON bytes, padded to even
  const jsonBytes = new TextEncoder().encode(applJson);
  const applPayloadSize = 4 + jsonBytes.length;
  const applPad = applPayloadSize % 2 !== 0 ? 1 : 0;

  // Sample rate bytes (80-bit extended)
  const srBytes = SAMPLE_RATE_BYTES[sampleRate];
  if (!srBytes) throw new Error(`Unsupported sample rate: ${sampleRate}`);

  // Chunk sizes
  const commDataSize = 18;          // 2+4+2+10
  const ssndDataSize = 8 + pcmData.length; // offset(4)+blockSize(4)+data
  const applDataSize = applPayloadSize;

  // FORM size = "AIFF"(4) + chunks (each: tag(4)+size(4)+data+pad)
  const formContentSize =
    4 +
    (8 + commDataSize) +
    (8 + applDataSize + applPad) +
    (8 + ssndDataSize);

  const totalSize = 8 + formContentSize; // FORM tag + size + content
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let o = 0;

  // FORM header
  writeTag(view, o, 'FORM'); o += 4;
  view.setUint32(o, formContentSize, false); o += 4;
  writeTag(view, o, 'AIFF'); o += 4;

  // COMM chunk
  writeTag(view, o, 'COMM'); o += 4;
  view.setUint32(o, commDataSize, false); o += 4;
  view.setInt16(o, numChannels, false);   o += 2;
  view.setUint32(o, numFrames, false);    o += 4;
  view.setInt16(o, bitDepth, false);      o += 2;
  for (const b of srBytes) { view.setUint8(o++, b); }

  // APPL chunk
  writeTag(view, o, 'APPL'); o += 4;
  view.setUint32(o, applDataSize, false); o += 4;
  writeTag(view, o, 'op-1'); o += 4;
  buf.set(jsonBytes, o); o += jsonBytes.length;
  if (applPad) o++; // pad byte

  // SSND chunk
  writeTag(view, o, 'SSND'); o += 4;
  view.setUint32(o, ssndDataSize, false); o += 4;
  view.setUint32(o, 0, false); o += 4; // offset
  view.setUint32(o, 0, false); o += 4; // blockSize
  buf.set(pcmData, o);

  return buf;
}
