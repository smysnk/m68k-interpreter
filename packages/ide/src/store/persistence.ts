import type { FilesState } from '@/store/filesSlice';
import type { SettingsState } from '@/store/settingsSlice';
import type { UiShellState } from '@/store/uiShellSlice';

export const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v1';

export interface PersistedIdeState {
  files?: FilesState;
  settings?: Pick<
    SettingsState,
    'editorTheme' | 'followSystemTheme' | 'lineNumbers' | 'registerEditRadix' | 'terminalInputMode'
  >;
  uiShell?: Pick<
    UiShellState,
    'workspaceTab' | 'inspectorView' | 'contextView' | 'contextOpen' | 'layout'
  >;
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

  const rawValue = storage.getItem(IDE_PERSISTENCE_KEY);
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

  storage.setItem(IDE_PERSISTENCE_KEY, JSON.stringify(value));
}

export function clearPersistedIdeState(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(IDE_PERSISTENCE_KEY);
}
