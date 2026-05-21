import type { EarthwireSource } from './types.js';

export const lfoSource: EarthwireSource = {
	id: 'lfo',
	name: 'LFO',
	icon: '〜',
	description: 'Low-frequency oscillator — generates periodic waveforms to modulate external hardware',
	attribution: { provider: 'Earthwire', license: 'internal', url: '' },
	fields: [{ id: 'lfo', name: 'LFO Output', unit: '', expectedRange: [0, 1] }],
	connect: async () => {},
	disconnect: () => {},
	// Actual value generation is handled per-channel in ChannelWiringManager
	// using the channel's lfoConfig (shape + rate). This onUpdate is never called.
	onUpdate: () => () => {},
};
