import {
  PANEL_LAYOUT_SCHEMA_VERSION,
  createPanelConfiguration,
  getPanelDefaultTitle,
  getPanelHardwareDeviceConfigs,
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

function buildPreset(
  name: string,
  columnKinds: readonly (readonly {
    kind: PanelKind;
    minimized?: boolean;
    instanceSequence?: number;
  }[])[],
  widths?: readonly number[],
  rowSizes?: readonly (readonly number[] | undefined)[]
): PanelLayoutDocument {
  let nextInstanceSequence = 1;
  const instances: PanelLayoutDocument['instances'] = {};
  const columns: PanelColumn[] = columnKinds.map((entries, columnIndex) => {
    const panelIds = entries.map(({ kind, minimized = false, instanceSequence }) => {
      const sequence = instanceSequence ?? nextInstanceSequence;
      const id = `panel-${kind}-${sequence}`;
      nextInstanceSequence =
        instanceSequence === undefined
          ? nextInstanceSequence + 1
          : Math.max(nextInstanceSequence, sequence + 1);
      instances[id] = {
        id,
        kind,
        title: getPanelDefaultTitle(kind),
        minimized,
        config: createPanelConfiguration(kind, {
          instanceId: id,
          existingDevices: getPanelHardwareDeviceConfigs(Object.values(instances)),
        }),
      };
      return id;
    });
    return {
      id: `column-${columnIndex + 1}`,
      width: widths?.[columnIndex] ?? 100 / columnKinds.length,
      panelIds,
      panelSizes: Object.fromEntries(
        panelIds.map((panelId, panelIndex) => [
          panelId,
          rowSizes?.[columnIndex]?.[panelIndex] ?? 100 / panelIds.length,
        ])
      ),
    };
  });
  const terminalOwnerPanelId =
    Object.values(instances).find((panel) => panel.kind === 'terminal')?.id ?? null;

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
    description: 'Code beside a resizable screen and register inspector.',
    create: () =>
      buildPreset(
        'Classic IDE',
        [
          [{ kind: 'code', instanceSequence: 3 }],
          [
            { kind: 'terminal', instanceSequence: 1 },
            { kind: 'registers', instanceSequence: 2 },
          ],
        ],
        [41, 59],
        [undefined, [41, 59]]
      ),
  },
  {
    id: 'code-run',
    name: 'Code and Run',
    description: 'Editor beside the screen with registers ready below it.',
    create: () =>
      buildPreset('Code and Run', [
        [{ kind: 'code' }],
        [{ kind: 'terminal' }, { kind: 'registers', minimized: true }],
      ]),
  },
  {
    id: 'hardware-lab',
    name: 'Hardware Lab',
    description: 'Screen beside hardware with diagnostic panels one click away.',
    create: () =>
      buildPreset(
        'Hardware Lab',
        [
          [{ kind: 'terminal' }],
          [{ kind: 'hardware-display' }],
          [{ kind: 'hardware-digital-io' }, { kind: 'hardware-interrupts' }],
        ],
        [42, 26, 32]
      ),
  },
  {
    id: 'multimedia',
    name: 'Easy68K Multimedia',
    description: 'Code, graphics, sound, terminal, and registers for multimedia programs.',
    create: () =>
      buildPreset(
        'Easy68K Multimedia',
        [
          [{ kind: 'code' }, { kind: 'terminal', minimized: true }],
          [{ kind: 'graphics' }],
          [{ kind: 'sound' }, { kind: 'registers', minimized: true }],
        ],
        [28, 46, 26]
      ),
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Code, screen, debugger, registers, and memory across three columns.',
    create: () =>
      buildPreset('Debug', [
        [{ kind: 'code' }],
        [{ kind: 'terminal' }, { kind: 'debugger' }],
        [{ kind: 'registers' }, { kind: 'memory' }],
      ]),
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
