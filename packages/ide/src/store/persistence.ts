import type { FilesState } from '@/store/filesSlice';
import type { SettingsState } from '@/store/settingsSlice';
import type { UiShellState } from '@/store/uiShellSlice';
import type { HardwarePreferencesState } from '@/store/hardwareSlice';
import type { PanelLayoutState } from '@/store/panelLayoutTypes';
import { DEFAULT_EASY68K_HARDWARE_CONFIG, validateEasy68kHardwareConfig } from '@m68k/interpreter';

export const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v2';
export const LEGACY_IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v1';

export interface PersistedIdeState {
  schemaVersion?: 2;
  files?: FilesState;
  settings?: Pick<
    SettingsState,
    | 'editorTheme'
    | 'followSystemTheme'
    | 'lineNumbers'
    | 'registerEditRadix'
    | 'terminalInputMode'
    | 'cpuProfile'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizePersistedHardwarePreferences(
  value: unknown
): HardwarePreferencesState | undefined {
  if (!isRecord(value)) return undefined;
  const rawConfig = isRecord(value.config) ? value.config : {};
  const validation = validateEasy68kHardwareConfig({
    displayBase:
      typeof rawConfig.displayBase === 'number'
        ? rawConfig.displayBase
        : DEFAULT_EASY68K_HARDWARE_CONFIG.displayBase,
    ledAddress:
      typeof rawConfig.ledAddress === 'number'
        ? rawConfig.ledAddress
        : DEFAULT_EASY68K_HARDWARE_CONFIG.ledAddress,
    switchAddress:
      typeof rawConfig.switchAddress === 'number'
        ? rawConfig.switchAddress
        : DEFAULT_EASY68K_HARDWARE_CONFIG.switchAddress,
    buttonAddress:
      typeof rawConfig.buttonAddress === 'number'
        ? rawConfig.buttonAddress
        : DEFAULT_EASY68K_HARDWARE_CONFIG.buttonAddress,
  });
  const config =
    validation.valid && validation.config
      ? validation.config
      : { ...DEFAULT_EASY68K_HARDWARE_CONFIG };
  const automaticInterruptLevels = Array.isArray(value.automaticInterruptLevels)
    ? [...new Set(value.automaticInterruptLevels)]
        .filter(
          (level): level is number =>
            typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 7
        )
        .sort((left, right) => right - left)
    : [];
  const rawInterval =
    typeof value.automaticInterruptIntervalMs === 'number'
      ? value.automaticInterruptIntervalMs
      : 1000;
  return {
    config,
    automaticInterruptLevels,
    automaticInterruptIntervalMs: Math.min(60_000, Math.max(50, Math.round(rawInterval) || 1000)),
  };
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

  const rawValue =
    storage.getItem(IDE_PERSISTENCE_KEY) ?? storage.getItem(LEGACY_IDE_PERSISTENCE_KEY);
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
