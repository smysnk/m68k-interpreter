import { useSyncExternalStore } from 'react';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';

export function useRuntimeSession() {
  return useSyncExternalStore(
    runtimeSessionStore.subscribe,
    runtimeSessionStore.getSnapshot,
    runtimeSessionStore.getSnapshot
  );
}
