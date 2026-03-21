import { describe, it, expect, vi } from 'vitest';
import { midiCcMessage, midiNoteOnMessage, midiNoteOffMessage, continuousToMidi } from './midi.js';

describe('MIDI message helpers', () => {
  it('creates CC message bytes', () => {
    const msg = midiCcMessage(1, 74, 64);
    expect(msg).toEqual([0xb0, 74, 64]);
  });

  it('creates CC on channel 10', () => {
    const msg = midiCcMessage(10, 1, 127);
    expect(msg).toEqual([0xb9, 1, 127]);
  });

  it('creates note on message', () => {
    const msg = midiNoteOnMessage(1, 60, 100);
    expect(msg).toEqual([0x90, 60, 100]);
  });

  it('creates note off message', () => {
    const msg = midiNoteOffMessage(1, 60);
    expect(msg).toEqual([0x80, 60, 0]);
  });

  it('converts 0-1 continuous to 0-127 MIDI', () => {
    expect(continuousToMidi(0.0)).toBe(0);
    expect(continuousToMidi(1.0)).toBe(127);
    expect(continuousToMidi(0.5)).toBe(64);
  });

  it('clamps out-of-range values', () => {
    expect(continuousToMidi(-0.1)).toBe(0);
    expect(continuousToMidi(1.5)).toBe(127);
  });
});
