import React from 'react';

export const COMPACT_SHELL_MAX_WIDTH = 960;

function readIsCompactShell(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth <= COMPACT_SHELL_MAX_WIDTH;
}

let listening = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('resize', notifyViewportListeners);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listening && typeof window !== 'undefined') {
      window.removeEventListener('resize', notifyViewportListeners);
      listening = false;
    }
  };
}

function notifyViewportListeners(): void {
  listeners.forEach((listener) => listener());
}

export function useCompactShell(): boolean {
  return React.useSyncExternalStore(subscribe, readIsCompactShell, () => false);
}
