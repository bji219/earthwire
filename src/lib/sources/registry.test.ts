import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceRegistry } from './registry.js';
import type { EarthwireSource, SourceUpdate } from './types.js';

function createMockSource(id: string): EarthwireSource {
  const listeners = new Set<(update: SourceUpdate) => void>();
  return {
    id,
    name: `Mock ${id}`,
    icon: 'test',
    description: 'Test source',
    attribution: { provider: 'Test', license: 'MIT', url: 'https://example.com' },
    fields: [{ id: 'value', name: 'Value', unit: 'units', expectedRange: [0, 100] as [number, number] }],
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    onUpdate: vi.fn((cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    })
  };
}

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  it('registers and retrieves a source factory', () => {
    const source = createMockSource('test');
    registry.registerFactory('test', () => source);
    expect(registry.getAvailableSources()).toContain('test');
  });

  it('acquires a source and calls connect', async () => {
    const source = createMockSource('test');
    registry.registerFactory('test', () => source);
    const acquired = await registry.acquire('test');
    expect(acquired).toBe(source);
    expect(source.connect).toHaveBeenCalledOnce();
  });

  it('returns same instance on second acquire (singleton)', async () => {
    const source = createMockSource('test');
    registry.registerFactory('test', () => source);
    const first = await registry.acquire('test');
    const second = await registry.acquire('test');
    expect(first).toBe(second);
    expect(source.connect).toHaveBeenCalledOnce();
  });

  it('disconnects when last consumer releases', async () => {
    const source = createMockSource('test');
    registry.registerFactory('test', () => source);
    await registry.acquire('test');
    await registry.acquire('test');
    registry.release('test');
    expect(source.disconnect).not.toHaveBeenCalled();
    registry.release('test');
    expect(source.disconnect).toHaveBeenCalledOnce();
  });

  it('throws on acquire of unregistered source', async () => {
    await expect(registry.acquire('nonexistent')).rejects.toThrow();
  });
});
