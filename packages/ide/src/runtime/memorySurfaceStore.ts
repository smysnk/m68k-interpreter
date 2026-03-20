import type { MemoryMeta } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';

export interface MemorySurfaceSnapshot {
  meta: MemoryMeta;
}

type Listener = () => void;
type MemorySurfaceRuntime = Pick<IdeRuntimeSession, 'getMemory' | 'getMemoryMeta' | 'readMemoryRange'>;

function createEmptyMemoryMeta(): MemoryMeta {
  return {
    usedBytes: 0,
    minAddress: null,
    maxAddress: null,
    version: 1,
  };
}

function memoryMetaEquals(left: MemoryMeta, right: MemoryMeta): boolean {
  return (
    left.usedBytes === right.usedBytes &&
    left.minAddress === right.minAddress &&
    left.maxAddress === right.maxAddress &&
    left.version === right.version
  );
}

class MemorySurfaceStore {
  private readonly listeners = new Set<Listener>();
  private runtime: MemorySurfaceRuntime | null = null;
  private snapshot: MemorySurfaceSnapshot = {
    meta: createEmptyMemoryMeta(),
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): MemorySurfaceSnapshot => this.snapshot;

  getServerSnapshot = (): MemorySurfaceSnapshot => this.snapshot;

  replaceFromRuntime(runtime: MemorySurfaceRuntime, meta: MemoryMeta = runtime.getMemoryMeta()): void {
    this.runtime = runtime;
    this.publish(meta);
  }

  setMeta(meta: MemoryMeta): void {
    this.publish(meta);
  }

  reset(): void {
    this.runtime = null;
    this.publish(createEmptyMemoryMeta());
  }

  readRange(startAddress: number, length: number): Uint8Array {
    if (length <= 0) {
      return new Uint8Array(0);
    }

    if (!this.runtime) {
      return new Uint8Array(length);
    }

    return this.runtime.readMemoryRange(startAddress, length);
  }

  exportMemory(): Record<number, number> {
    return this.runtime?.getMemory() ?? {};
  }

  private publish(meta: MemoryMeta): void {
    if (memoryMetaEquals(this.snapshot.meta, meta)) {
      return;
    }

    this.snapshot = { meta };

    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const memorySurfaceStore = new MemorySurfaceStore();
