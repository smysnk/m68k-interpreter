import {
  PANEL_LAYOUT_SCHEMA_VERSION,
  createPanelConfiguration,
  type PanelColumn,
  type PanelKind,
  type PanelLayoutDocument,
  type PanelPresetId,
} from '@/store/panelLayoutTypes';

export interface PanelPresetDefinition {
  id: PanelPresetId;
  name: string;
  description: string;
  create: () => PanelLayoutDocument;
}

const TITLES: Record<PanelKind, string> = {
  terminal: 'Screen',
  code: 'Code',
  registers: 'Registers',
  memory: 'Memory',
  hardware: 'Hardware I/O',
  help: 'Help',
};

function buildPreset(
  name: string,
  columnKinds: readonly (readonly { kind: PanelKind; minimized?: boolean }[])[],
  widths?: readonly number[]
): PanelLayoutDocument {
  let nextInstanceSequence = 1;
  const instances: PanelLayoutDocument['instances'] = {};
  const columns: PanelColumn[] = columnKinds.map((entries, columnIndex) => {
    const panelIds = entries.map(({ kind, minimized = false }) => {
      const id = `panel-${kind}-${nextInstanceSequence}`;
      nextInstanceSequence += 1;
      instances[id] = {
        id,
        kind,
        title: TITLES[kind],
        minimized,
        config: createPanelConfiguration(kind),
      };
      return id;
    });
    return {
      id: `column-${columnIndex + 1}`,
      width: widths?.[columnIndex] ?? 100 / columnKinds.length,
      panelIds,
    };
  });
  const terminalOwnerPanelId = Object.values(instances).find((panel) => panel.kind === 'terminal')?.id ?? null;

  return {
    schemaVersion: PANEL_LAYOUT_SCHEMA_VERSION,
    name,
    columnCount: columns.length,
    columns,
    floatingPanelIds: [],
    instances,
    focusedPanelId: columns[0]?.panelIds[0] ?? null,
    terminalOwnerPanelId,
    nextInstanceSequence,
    nextColumnSequence: columns.length + 1,
  };
}

export const PANEL_PRESETS: readonly PanelPresetDefinition[] = [
  {
    id: 'classic',
    name: 'Classic IDE',
    description: 'Screen and registers in the familiar two-column layout.',
    create: () => buildPreset('Classic IDE', [[{ kind: 'terminal' }], [{ kind: 'registers' }]], [61, 39]),
  },
  {
    id: 'code-run',
    name: 'Code and Run',
    description: 'Editor beside the screen with registers ready below it.',
    create: () =>
      buildPreset('Code and Run', [[{ kind: 'code' }], [{ kind: 'terminal' }, { kind: 'registers', minimized: true }]]),
  },
  {
    id: 'hardware-lab',
    name: 'Hardware Lab',
    description: 'Screen beside hardware with diagnostic panels one click away.',
    create: () =>
      buildPreset('Hardware Lab', [[{ kind: 'terminal' }], [{ kind: 'hardware' }, { kind: 'registers', minimized: true }, { kind: 'memory', minimized: true }]], [57, 43]),
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Code, screen, registers, and memory across three columns.',
    create: () =>
      buildPreset('Debug', [[{ kind: 'code' }], [{ kind: 'terminal' }], [{ kind: 'registers' }, { kind: 'memory' }]]),
  },
  {
    id: 'terminal-focus',
    name: 'Terminal Focus',
    description: 'A distraction-free interactive screen.',
    create: () => buildPreset('Terminal Focus', [[{ kind: 'terminal' }]]),
  },
] as const;

export function createPanelPreset(id: PanelPresetId): PanelLayoutDocument {
  return (PANEL_PRESETS.find((preset) => preset.id === id) ?? PANEL_PRESETS[0]!).create();
}

export function getPanelDefaultTitle(kind: PanelKind): string {
  return TITLES[kind];
}
