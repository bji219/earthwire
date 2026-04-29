import { writable } from 'svelte/store';

export interface ChannelMonitorData {
	sourceId: string;
	fieldId: string;
	connected: boolean;
	rawValue: number;
	normalizedValue: number;
	lastUpdate: number;
	outputLabel: string;
	sequencerPosition?: number;
	sequencerLength?: number;
}

export const monitorData = writable<ChannelMonitorData[]>([]);
