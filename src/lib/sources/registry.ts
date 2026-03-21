import type { EarthwireSource } from './types.js';

type SourceFactory = () => EarthwireSource;

interface SourceEntry {
  source: EarthwireSource;
  refCount: number;
}

export class SourceRegistry {
  private factories = new Map<string, SourceFactory>();
  private instances = new Map<string, SourceEntry>();

  registerFactory(id: string, factory: SourceFactory): void {
    this.factories.set(id, factory);
  }

  getAvailableSources(): string[] {
    return Array.from(this.factories.keys());
  }

  async acquire(id: string): Promise<EarthwireSource> {
    const existing = this.instances.get(id);
    if (existing) {
      existing.refCount++;
      return existing.source;
    }

    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`No source registered with id: ${id}`);
    }

    const source = factory();
    await source.connect();
    this.instances.set(id, { source, refCount: 1 });
    return source;
  }

  release(id: string): void {
    const entry = this.instances.get(id);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      entry.source.disconnect();
      this.instances.delete(id);
    }
  }

  getSource(id: string): EarthwireSource | undefined {
    return this.instances.get(id)?.source;
  }
}
