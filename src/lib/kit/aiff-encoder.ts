// OP-1 / OP-1 Field drum kits must be AIFC format with 'sowt' compression
// (16-bit little-endian PCM) and a fixed 4096-byte APPL content block.
// Hardware-generated kits confirm this format; plain AIFF causes the firmware
// to ignore the APPL chunk and auto-slice the audio instead.

export interface AiffOptions {
  sampleRate: number;
  numChannels: number;
  samples: Float32Array;  // interleaved, -1..1
  applJson: string;       // 4096-byte padded JSON from buildOp1Metadata()
}

// 80-bit IEEE 754 extended for common sample rates
const SAMPLE_RATE_BYTES: Record<number, number[]> = {
  44100: [0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  48000: [0x40, 0x0E, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

// AIFC version stamp (required FVER chunk value)
const AIFC_VERSION = 0xA2805140;

// sowt compression name as Pascal string: 1-byte length + 41-byte string = 42 bytes (even)
const SOWT_NAME = 'Signed integer (little-endian) linear PCM'; // 41 chars
const COMM_DATA_SIZE = 18 + 4 + 1 + SOWT_NAME.length; // = 64 bytes

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

// Convert float32 samples to 16-bit little-endian (sowt)
function convertSamples(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
    view.setInt16(i * 2, v, true); // little-endian
  }
  return out;
}

export function encodeAiff(opts: AiffOptions): Uint8Array {
  const { sampleRate, numChannels, samples, applJson } = opts;
  const numFrames = Math.floor(samples.length / numChannels);

  const srBytes = SAMPLE_RATE_BYTES[sampleRate];
  if (!srBytes) throw new Error(`Unsupported sample rate: ${sampleRate}`);

  const pcmData  = convertSamples(samples);
  const applBytes = new TextEncoder().encode(applJson); // exactly 4096 bytes
  if (applBytes.length !== 4096) throw new Error(`APPL content must be 4096 bytes, got ${applBytes.length}`);

  const APPL_PAYLOAD = 4 + applBytes.length; // 'op-1' + 4096 = 4100
  const SSND_DATA    = 8 + pcmData.length;

  // FORM AIFC body: 'AIFC'(4) + FVER(12) + COMM(8+64) + APPL(8+4100) + SSND(8+SSND_DATA)
  const formContentSize =
    4 +          // 'AIFC'
    12 +         // FVER chunk
    (8 + COMM_DATA_SIZE) +
    (8 + APPL_PAYLOAD) +
    (8 + SSND_DATA);

  const totalSize = 8 + formContentSize;
  const buf  = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let o = 0;

  // FORM header
  writeTag(view, o, 'FORM'); o += 4;
  view.setUint32(o, formContentSize, false); o += 4;
  writeTag(view, o, 'AIFC'); o += 4;

  // FVER chunk (required for AIFC)
  writeTag(view, o, 'FVER'); o += 4;
  view.setUint32(o, 4, false); o += 4;
  view.setUint32(o, AIFC_VERSION, false); o += 4;

  // COMM chunk (AIFC format, 64 bytes)
  writeTag(view, o, 'COMM'); o += 4;
  view.setUint32(o, COMM_DATA_SIZE, false); o += 4;
  view.setInt16(o, numChannels, false); o += 2;
  view.setUint32(o, numFrames, false);  o += 4;
  view.setInt16(o, 16, false);          o += 2; // 16-bit
  for (const b of srBytes) { view.setUint8(o++, b); }
  writeTag(view, o, 'sowt'); o += 4;    // compressionType
  view.setUint8(o++, SOWT_NAME.length); // Pascal string length
  for (let i = 0; i < SOWT_NAME.length; i++) view.setUint8(o++, SOWT_NAME.charCodeAt(i));

  // APPL chunk: 'op-1' + 4096-byte JSON block
  writeTag(view, o, 'APPL'); o += 4;
  view.setUint32(o, APPL_PAYLOAD, false); o += 4;
  writeTag(view, o, 'op-1'); o += 4;
  buf.set(applBytes, o); o += applBytes.length;

  // SSND chunk
  writeTag(view, o, 'SSND'); o += 4;
  view.setUint32(o, SSND_DATA, false); o += 4;
  view.setUint32(o, 0, false); o += 4; // offset
  view.setUint32(o, 0, false); o += 4; // blockSize
  buf.set(pcmData, o);

  return buf;
}
