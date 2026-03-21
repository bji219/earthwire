// Web MIDI API types (browser-only, not available in test environment)
declare global {
  interface Window {
    requestMIDIAccess?: () => Promise<MIDIAccess>;
  }
  interface MIDIAccess {
    outputs: Map<string, MIDIOutput>;
  }
  interface MIDIOutput {
    send(data: number[], timestamp?: number): void;
  }
}

export function continuousToMidi(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 127);
}

export function midiCcMessage(channel: number, cc: number, value: number): number[] {
  return [0xb0 + (channel - 1), cc, value];
}

export function midiNoteOnMessage(channel: number, note: number, velocity: number): number[] {
  return [0x90 + (channel - 1), note, velocity];
}

export function midiNoteOffMessage(channel: number, note: number): number[] {
  return [0x80 + (channel - 1), note, 0];
}

export class MidiOutput {
  private access: MIDIAccess | null = null;

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess();
      return true;
    } catch {
      return false;
    }
  }

  getOutputPorts(): MIDIOutput[] {
    if (!this.access) return [];
    return Array.from(this.access.outputs.values());
  }

  sendCc(portId: string, channel: number, cc: number, value: number): void {
    const port = this.getPort(portId);
    if (!port) return;
    port.send(midiCcMessage(channel, cc, continuousToMidi(value)));
  }

  sendNoteOn(portId: string, channel: number, note: number, velocity: number): void {
    const port = this.getPort(portId);
    if (!port) return;
    port.send(midiNoteOnMessage(channel, note, velocity));
  }

  sendNoteOff(portId: string, channel: number, note: number): void {
    const port = this.getPort(portId);
    if (!port) return;
    port.send(midiNoteOffMessage(channel, note));
  }

  private getPort(portId: string): MIDIOutput | undefined {
    if (!this.access) return undefined;
    return this.access.outputs.get(portId);
  }
}
