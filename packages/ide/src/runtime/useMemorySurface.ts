import { useSyncExternalStore } from 'react';
import { memorySurfaceStore, type MemorySurfaceSnapshot } from '@/runtime/memorySurfaceStore';

export function useMemorySurface(): MemorySurfaceSnapshot {
  return useSyncExternalStore(
    memorySurfaceStore.subscribe,
    memorySurfaceStore.getSnapshot,
    memorySurfaceStore.getServerSnapshot
  );
}
