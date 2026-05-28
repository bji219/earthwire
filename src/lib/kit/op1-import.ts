// Import flow: file → parsed AIFC → APPL → 24 SlotMeta + per-slot AudioBuffers
// → write to kit store. Inverse of doExport in KitBuilder.svelte.

import { parseAiff } from './aiff-parser';
import { parseOp1Appl } from './op1-metadata-parse';
import { SLOT_COLORS, type DeviceMode, type SlotMeta } from './types';
import { kit } from '../stores/kit';

export interface ImportSummary {
  kitName: string;
  deviceMode: DeviceMode;
  filledCount: number;
}

// Slice [startFrame, endFrame) out of a source buffer into a new standalone
// AudioBuffer. Uses `new AudioBuffer({...})` (JS heap) per the kit-store rule
// so the slice survives Web Audio's pooled allocator.
function sliceBuffer(
  source: AudioBuffer,
  startFrame: number,
  endFrame: number
): AudioBuffer {
  const length = Math.max(1, endFrame - startFrame);
  const out = new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length,
    sampleRate: source.sampleRate,
  });
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(startFrame, startFrame + length));
  }
  return out;
}

export async function importOp1Kit(file: File): Promise<ImportSummary> {
  const arrayBuffer = await file.arrayBuffer();
  const parsed = parseAiff(arrayBuffer);
  if (!parsed.applData) {
    throw new Error('No OP-1 metadata found — this is not a drum kit AIFF');
  }
  const ingested = parseOp1Appl(parsed.applData, parsed.sampleRate);

  // Clear existing kit, then set top-level fields before slots so any
  // reactive consumers see them in the right order.
  kit.reset();
  kit.setDeviceMode(ingested.deviceMode);
  kit.setName(ingested.name);

  let filledCount = 0;
  for (let i = 0; i < 24; i++) {
    const slot = ingested.slots[i];
    if (!slot) continue;

    const slotBuffer = sliceBuffer(parsed.audioBuffer, slot.startFrame, slot.endFrame);
    const slotMeta: SlotMeta = {
      name: ingested.name ? `${ingested.name} ${i + 1}` : `slot ${i + 1}`,
      sourceType: 'local',
      trimStart: 0,
      trimEnd: slotBuffer.duration,
      fullDuration: slotBuffer.duration,
      color: SLOT_COLORS[i],
      playMode: slot.playMode,
    };
    kit.setSlot(i, slotMeta, slotBuffer);
    filledCount++;
  }

  return {
    kitName: ingested.name,
    deviceMode: ingested.deviceMode,
    filledCount,
  };
}
