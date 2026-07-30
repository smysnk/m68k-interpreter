import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  allocateEasy68kHardwareConfig,
  type Easy68kHardwareDeviceConfig,
} from '@m68k/interpreter';

export const PANEL_LAYOUT_SCHEMA_VERSION = 2 as const;
export const MIN_PANEL_COLUMNS = 1;
export const MAX_PANEL_COLUMNS = 4;
export const MAX_PANEL_INSTANCES = 32;
export const MAX_SAVED_PANEL_VIEWS = 20;

export type PanelKind =
  | 'terminal'
  | 'code'
  | 'registers'
  | 'memory'
  | 'hardware-display'
  | 'hardware-digital-io'
  | 'hardware-interrupts'
  | 'help';
export type PanelInstanceId = string;
export type PanelColumnId = string;
export type PanelViewId = string;
export type PanelPresetId = 'classic' | 'code-run' | 'hardware-lab' | 'debug' | 'terminal-focus';

export interface PanelKindDefinition {
  kind: PanelKind;
  title: string;
  icon: string;
  canDuplicate: boolean;
  canFloat: boolean;
  minimumWidth: number;
  minimumFloatingSize: { width: number; height: number };
  addMenuOrder: number;
}

export const PANEL_KIND_DEFINITIONS: Record<PanelKind, PanelKindDefinition> = {
  terminal: {
    kind: 'terminal',
    title: 'Screen',
    icon: '▣',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 360,
    minimumFloatingSize: { width: 440, height: 340 },
    addMenuOrder: 0,
  },
  code: {
    kind: 'code',
    title: 'Code',
    icon: '⌨',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 320,
    minimumFloatingSize: { width: 420, height: 320 },
    addMenuOrder: 1,
  },
  registers: {
    kind: 'registers',
    title: 'Registers',
    icon: 'R',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 280,
    minimumFloatingSize: { width: 380, height: 300 },
    addMenuOrder: 2,
  },
  memory: {
    kind: 'memory',
    title: 'Memory',
    icon: 'M',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 320,
    minimumFloatingSize: { width: 520, height: 340 },
    addMenuOrder: 3,
  },
  'hardware-display': {
    kind: 'hardware-display',
    title: 'Seven-segment display',
    icon: '7SEG',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 360,
    minimumFloatingSize: { width: 520, height: 260 },
    addMenuOrder: 4,
  },
  'hardware-digital-io': {
    kind: 'hardware-digital-io',
    title: 'LEDs / Switches / Buttons',
    icon: 'I/O',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 520,
    minimumFloatingSize: { width: 720, height: 360 },
    addMenuOrder: 5,
  },
  'hardware-interrupts': {
    kind: 'hardware-interrupts',
    title: 'Interrupt requests',
    icon: 'IRQ',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 360,
    minimumFloatingSize: { width: 520, height: 320 },
    addMenuOrder: 6,
  },
  help: {
    kind: 'help',
    title: 'Help',
    icon: '?',
    canDuplicate: true,
    canFloat: true,
    minimumWidth: 280,
    minimumFloatingSize: { width: 380, height: 300 },
    addMenuOrder: 7,
  },
};

export const PANEL_KINDS = Object.freeze(
  Object.keys(PANEL_KIND_DEFINITIONS) as PanelKind[]
);

export interface FloatingPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PanelConfiguration =
  | { kind: 'terminal' }
  | { kind: 'code'; fileId?: string }
  | { kind: 'registers' }
  | { kind: 'memory'; startAddress?: number }
  | {
      kind: 'hardware-display';
      deviceId: string;
      displayBase: number;
    }
  | {
      kind: 'hardware-digital-io';
      deviceId: string;
      ledAddress: number;
      switchAddress: number;
      buttonAddress: number;
    }
  | { kind: 'hardware-interrupts' }
  | { kind: 'help' };

export interface PanelInstance {
  id: PanelInstanceId;
  kind: PanelKind;
  title: string;
  minimized: boolean;
  floatingRect?: FloatingPanelRect;
  config: PanelConfiguration;
}

export interface PanelColumn {
  id: PanelColumnId;
  width: number;
  panelIds: PanelInstanceId[];
}

export interface PanelLayoutDocument {
  schemaVersion: typeof PANEL_LAYOUT_SCHEMA_VERSION;
  name: string;
  columnCount: number;
  columns: PanelColumn[];
  floatingPanelIds: PanelInstanceId[];
  instances: Record<PanelInstanceId, PanelInstance>;
  focusedPanelId: PanelInstanceId | null;
  terminalOwnerPanelId: PanelInstanceId | null;
  nextInstanceSequence: number;
  nextColumnSequence: number;
}

export interface SavedPanelView {
  id: PanelViewId;
  name: string;
  createdAt: string;
  updatedAt: string;
  document: PanelLayoutDocument;
}

export interface PanelLayoutState {
  activeLayout: PanelLayoutDocument;
  activeSourceViewId: PanelViewId | null;
  activeLayoutDirty: boolean;
  userViews: Record<PanelViewId, SavedPanelView>;
  userViewOrder: PanelViewId[];
}

export interface PanelPlacementTarget {
  columnId: PanelColumnId;
  index?: number;
}

export interface PanelCreateTarget extends Partial<PanelPlacementTarget> {
  floatingRect?: FloatingPanelRect;
}

export function getPanelDefaultTitle(kind: PanelKind): string {
  return PANEL_KIND_DEFINITIONS[kind].title;
}

export function getPanelHardwareDeviceConfigs(
  instances: Iterable<PanelInstance>
): Easy68kHardwareDeviceConfig[] {
  const devices: Easy68kHardwareDeviceConfig[] = [];
  const seen = new Set<string>();
  for (const instance of instances) {
    if (instance.config.kind === 'hardware-display') {
      if (seen.has(instance.config.deviceId)) continue;
      seen.add(instance.config.deviceId);
      devices.push({
        id: instance.config.deviceId,
        deviceType: 'display',
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        displayBase: instance.config.displayBase,
      });
    } else if (instance.config.kind === 'hardware-digital-io') {
      if (seen.has(instance.config.deviceId)) continue;
      seen.add(instance.config.deviceId);
      devices.push({
        id: instance.config.deviceId,
        deviceType: 'digital-io',
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        ledAddress: instance.config.ledAddress,
        switchAddress: instance.config.switchAddress,
        buttonAddress: instance.config.buttonAddress,
      });
    }
  }
  return devices;
}

export function createPanelConfiguration(
  kind: PanelKind,
  options: {
    instanceId?: string;
    existingDevices?: readonly Easy68kHardwareDeviceConfig[];
  } = {}
): PanelConfiguration {
  const deviceId = `device-${options.instanceId ?? kind}`;
  const existingDevices = options.existingDevices ?? [];
  if (kind === 'hardware-display') {
    const allocation = allocateEasy68kHardwareConfig(
      existingDevices,
      DEFAULT_EASY68K_HARDWARE_CONFIG,
      'display'
    );
    if (!allocation) {
      throw new Error('No non-conflicting seven-segment address range is available.');
    }
    return { kind, deviceId, displayBase: allocation.displayBase };
  }
  if (kind === 'hardware-digital-io') {
    const allocation = allocateEasy68kHardwareConfig(
      existingDevices,
      DEFAULT_EASY68K_HARDWARE_CONFIG,
      'digital-io'
    );
    if (!allocation) {
      throw new Error('No non-conflicting digital I/O address range is available.');
    }
    return {
      kind,
      deviceId,
      ledAddress: allocation.ledAddress,
      switchAddress: allocation.switchAddress,
      buttonAddress: allocation.buttonAddress,
    };
  }
  return { kind } as PanelConfiguration;
}
