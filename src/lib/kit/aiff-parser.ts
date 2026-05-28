// Pure-JS AIFF/AIFC parser with chunk-level access. Built specifically for
// kit ingestion — we need to extract the APPL chunk (which contains the OP-1
// drum kit metadata) alongside the PCM audio. The existing decodeAiff in
// audio-processor.ts is intentionally narrow (no APPL, no sowt support); this
// parser handles both.

export type AiffCompression = 'NONE' | 'sowt' | 'twos' | 'raw ';

export interface ParsedAiff {
  numChannels: number;
  sampleRate: number;
  bitDepth: number;
  compressionType: AiffCompression;
  audioBuffer: AudioBuffer;
  applData: Uint8Array | null; // raw APPL payload (incl. 'op-1' signature)
}

function readStr(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

// 80-bit IEEE 754 extended float — AIFF stores sample rate this way.
function read80Float(view: DataView, offset: number): number {
  const exponent = (view.getUint16(offset, false) & 0x7fff) - 16383;
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  return (hi * 0x100000000 + lo) * Math.pow(2, exponent - 63);
}

export function parseAiff(buffer: ArrayBuffer): ParsedAiff {
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
  let compressionType: AiffCompression = 'NONE';
  let applData: Uint8Array | null = null;

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
        compressionType = readStr(view, chunkStart + 18, 4) as AiffCompression;
      }
    } else if (chunkId === 'SSND') {
      const ssndOffset = view.getUint32(chunkStart, false);
      soundDataOffset  = chunkStart + 8 + ssndOffset;
    } else if (chunkId === 'APPL') {
      // Keep the raw payload — the next stage will validate the 'op-1' signature
      applData = new Uint8Array(buffer, chunkStart, chunkSize);
    }
  }

  if (!sampleRate || !numFrames || !numChannels) {
    throw new Error('AIFF COMM chunk missing or corrupt');
  }
  if (compressionType !== 'NONE' && compressionType !== 'sowt' &&
      compressionType !== 'twos' && compressionType !== 'raw ') {
    throw new Error(`Unsupported AIFF-C compression: "${compressionType}"`);
  }

  // sowt = little-endian PCM (OP-1 Field uses this). All others are big-endian.
  const littleEndian = compressionType === 'sowt';
  const bytesPerSample = Math.ceil(bitDepth / 8);
  const frameStride = bytesPerSample * numChannels;

  const audioBuffer = new AudioBuffer({
    numberOfChannels: numChannels,
    length: numFrames,
    sampleRate,
  });

  for (let ch = 0; ch < numChannels; ch++) {
    const out = audioBuffer.getChannelData(ch);
    for (let f = 0; f < numFrames; f++) {
      const bytePos = soundDataOffset + f * frameStride + ch * bytesPerSample;
      let s = 0;
      if (bitDepth === 16) {
        s = view.getInt16(bytePos, littleEndian) / 32768;
      } else if (bitDepth === 24) {
        // 24-bit reads still depend on endianness
        const b0 = view.getUint8(bytePos);
        const b1 = view.getUint8(bytePos + 1);
        const b2 = view.getUint8(bytePos + 2);
        let v = littleEndian
          ? (b2 << 16) | (b1 << 8) | b0
          : (b0 << 16) | (b1 << 8) | b2;
        if (v & 0x800000) v -= 0x1000000;
        s = v / 8388608;
      } else if (bitDepth === 32) {
        s = view.getInt32(bytePos, littleEndian) / 2147483648;
      }
      out[f] = s;
    }
  }

  return { numChannels, sampleRate, bitDepth, compressionType, audioBuffer, applData };
}
