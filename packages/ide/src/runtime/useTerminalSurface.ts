import { useSyncExternalStore } from 'react';
import {
  terminalSurfaceStore,
  type TerminalSurfaceSnapshot,
} from '@/runtime/terminalSurfaceStore';

export function useTerminalSurface(): TerminalSurfaceSnapshot {
  return useSyncExternalStore(
    terminalSurfaceStore.subscribe,
    terminalSurfaceStore.getSnapshot,
    terminalSurfaceStore.getServerSnapshot
  );
}
