import type { FilesState } from '@/store/filesSlice';
import type { SettingsState } from '@/store/settingsSlice';
import type { UiShellState } from '@/store/uiShellSlice';
import type { HardwarePreferencesState } from '@/store/hardwareSlice';
import type { PanelLayoutState } from '@/store/panelLayoutTypes';

export const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v2';
export const LEGACY_IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v1';

export interface PersistedIdeState {
  schemaVersion?: 2;
  files?: FilesState;
  settings?: Pick<
    SettingsState,
    'editorTheme' | 'followSystemTheme' | 'lineNumbers' | 'registerEditRadix' | 'terminalInputMode'
  >;
  uiShell?: Pick<
    UiShellState,
    'workspaceTab' | 'inspectorView' | 'contextView' | 'contextOpen' | 'layout'
  >;
  hardware?: Pick<
    HardwarePreferencesState,
    'config' | 'automaticInterruptLevels' | 'automaticInterruptIntervalMs'
  >;
  panelLayout?: PanelLayoutState;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistedIdeState(): PersistedIdeState | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const rawValue = storage.getItem(IDE_PERSISTENCE_KEY) ?? storage.getItem(LEGACY_IDE_PERSISTENCE_KEY);
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as PersistedIdeState;
  } catch {
    return undefined;
  }
}

export function writePersistedIdeState(value: PersistedIdeState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(IDE_PERSISTENCE_KEY, JSON.stringify({ ...value, schemaVersion: 2 }));
  } catch {
    // Storage can be unavailable or over quota. The active in-memory workspace remains usable.
  }
}

export function clearPersistedIdeState(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(IDE_PERSISTENCE_KEY);
  storage.removeItem(LEGACY_IDE_PERSISTENCE_KEY);
}
