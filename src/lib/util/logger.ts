const PREFIX = '[Earthwire]';

function makeLogger(tag: string) {
	return (msg: string, ...args: unknown[]) =>
		console.log(`${PREFIX}[${tag}] ${msg}`, ...args);
}

export const log = {
	source: makeLogger('source'),
	engine: makeLogger('engine'),
	transport: makeLogger('transport'),
	wiring: makeLogger('wiring'),
	warn: (msg: string, ...args: unknown[]) => console.warn(`${PREFIX} ${msg}`, ...args)
};
