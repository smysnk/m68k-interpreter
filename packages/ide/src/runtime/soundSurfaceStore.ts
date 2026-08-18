import type { Easy68kSoundSnapshot } from '@m68k/interpreter';

type Listener = () => void;

export interface SoundHostState {
  supported: boolean;
  unlocked: boolean;
  muted: boolean;
  volume: number;
  error: string | null;
}

export interface SoundSurfaceSnapshot {
  available: boolean;
  device: Easy68kSoundSnapshot | null;
  host: SoundHostState;
}

const defaultHost = (): SoundHostState => ({
  supported: typeof globalThis !== 'undefined' && 'AudioContext' in globalThis,
  unlocked: false,
  muted: false,
  volume: 1,
  error: null,
});

export function createSoundSurfaceStore() {
  let snapshot: SoundSurfaceSnapshot = { available: false, device: null, host: defaultHost() };
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => snapshot,
    publishDevice(device: Easy68kSoundSnapshot) {
      snapshot = {
        ...snapshot,
        available: true,
        device: {
          ...device,
          standardReferences: device.standardReferences.map((entry) => ({ ...entry })),
          polyphonicReferences: device.polyphonicReferences.map((entry) => ({ ...entry })),
          voices: device.voices.map((voice) => ({ ...voice })),
          diagnostics: [...device.diagnostics],
          pendingCommands: device.pendingCommands.map((command) => structuredClone(command)),
          assets: device.assets.map((asset) => ({ ...asset })),
        },
      };
      emit();
    },
    publishHost(patch: Partial<SoundHostState>) {
      snapshot = { ...snapshot, host: { ...snapshot.host, ...patch } };
      emit();
    },
    reset() {
      snapshot = { available: false, device: null, host: defaultHost() };
      emit();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const soundSurfaceStore = createSoundSurfaceStore();
