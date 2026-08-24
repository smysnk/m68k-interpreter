import { describe, expect, it, vi } from 'vitest';
import panelLayoutReducer, {
  closePanel,
  commitPanelSizes,
  commitDigitalIoBitLabel,
  createPanel,
  duplicatePanel,
  floatPanel,
  initialPanelLayoutState,
  moveFloatingPanel,
  movePanel,
  resetToPreset,
  saveView,
  setColumnCount,
  setTerminalOwner,
  togglePanelMinimized,
} from './panelLayoutSlice';
import { createPanelPreset } from '@/panels/panelPresets';
import { MAX_PANEL_INSTANCES, PANEL_KINDS, type PanelKind } from './panelLayoutTypes';
import * as panelLayoutTypes from './panelLayoutTypes';
import {
  getPanelLayoutInvariantErrors,
  normalizePanelLayoutDocument,
} from './panelLayoutValidation';

function reduce(actions: Parameters<typeof panelLayoutReducer>[1][]) {
  return actions.reduce(panelLayoutReducer, structuredClone(initialPanelLayoutState));
}

describe('panelLayoutSlice', () => {
  it('creates independent valid preset documents', () => {
    const first = createPanelPreset('debug');
    const second = createPanelPreset('debug');
    first.columns[0]!.panelIds.length = 0;
    expect(second.columns[0]!.panelIds).toHaveLength(1);
    expect(getPanelLayoutInvariantErrors(second)).toEqual([]);
  });

  it('duplicates, minimizes, floats, docks, and closes instances without orphan placements', () => {
    let state = reduce([duplicatePanel({ sourcePanelId: 'panel-terminal-1' })]);
    const mirrorId = Object.values(state.activeLayout.instances).find(
      (panel) => panel.kind === 'terminal' && panel.id !== 'panel-terminal-1'
    )!.id;
    state = panelLayoutReducer(state, setTerminalOwner(mirrorId));
    state = panelLayoutReducer(state, togglePanelMinimized(mirrorId));
    expect(state.activeLayout.terminalOwnerPanelId).toBe('panel-terminal-1');
    state = panelLayoutReducer(
      state,
      floatPanel({ panelId: mirrorId, rect: { x: -8, y: -4, width: 10, height: 10 } })
    );
    expect(state.activeLayout.instances[mirrorId]?.floatingRect).toMatchObject({
      x: 0,
      y: 0,
      width: 280,
      height: 180,
    });
    state = panelLayoutReducer(
      state,
      movePanel({ panelId: mirrorId, columnId: state.activeLayout.columns[1]!.id, index: 0 })
    );
    state = panelLayoutReducer(state, closePanel(mirrorId));
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('redistributes removed columns and enforces the one-to-four range', () => {
    const state = reduce([
      setColumnCount(4),
      createPanel({ kind: 'memory', target: { columnId: 'column-4' } }),
      setColumnCount(1),
    ]);
    expect(state.activeLayout.columns).toHaveLength(1);
    expect(
      state.activeLayout.columns[0]?.panelIds.some(
        (id) => state.activeLayout.instances[id]?.kind === 'memory'
      )
    ).toBe(true);
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('saves immutable snapshots and resets to built-in views', () => {
    let state = reduce([createPanel({ kind: 'hardware-display' }), saveView({ name: 'Lab' })]);
    const viewId = state.userViewOrder[0]!;
    const savedCount = Object.keys(state.userViews[viewId]!.document.instances).length;
    state = panelLayoutReducer(state, createPanel({ kind: 'help' }));
    expect(Object.keys(state.userViews[viewId]!.document.instances)).toHaveLength(savedCount);
    state = panelLayoutReducer(state, resetToPreset('terminal-focus'));
    expect(state.activeLayout.columnCount).toBe(1);
    expect(state.activeLayoutDirty).toBe(false);
  });

  it('stores normalized row sizes independently for each panel column', () => {
    const state = reduce([
      commitPanelSizes({
        columnId: 'column-2',
        panelSizes: { 'panel-terminal-1': 68, 'panel-registers-2': 32 },
      }),
    ]);

    expect(state.activeLayout.columns[1]?.panelSizes).toEqual({
      'panel-terminal-1': 68,
      'panel-registers-2': 32,
    });
    expect(state.activeLayout.columns[0]?.panelSizes).toEqual({ 'panel-code-3': 100 });
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('repairs corrupt placement, owner, widths, and floating rectangles', () => {
    const normalized = normalizePanelLayoutDocument({
      name: 'Damaged',
      columnCount: 2,
      instances: {
        a: { id: 'a', kind: 'terminal', title: 'A', minimized: false, config: {} },
        b: {
          id: 'b',
          kind: 'memory',
          title: 'B',
          minimized: false,
          floatingRect: { x: NaN, y: -3, width: 1, height: 1 },
          config: {},
        },
      },
      columns: [{ id: 'one', width: NaN, panelIds: ['a', 'a', 'missing'] }],
      floatingPanelIds: ['b', 'a'],
      terminalOwnerPanelId: 'b',
      focusedPanelId: 'missing',
    });
    expect(getPanelLayoutInvariantErrors(normalized)).toEqual([]);
    expect(normalized.terminalOwnerPanelId).toBe('a');
    expect(normalized.instances.b?.floatingRect).toMatchObject({
      x: 32,
      y: 0,
      width: 280,
      height: 180,
    });
  });

  it('moves, focuses, and raises a floating panel in one semantic reducer action', () => {
    let state = reduce([
      floatPanel({ panelId: 'panel-terminal-1' }),
      floatPanel({ panelId: 'panel-registers-2' }),
    ]);
    state = panelLayoutReducer(
      state,
      moveFloatingPanel({
        panelId: 'panel-terminal-1',
        rect: { x: 80, y: 70, width: 500, height: 360 },
      })
    );
    expect(state.activeLayout.instances['panel-terminal-1']?.floatingRect).toEqual({
      x: 80,
      y: 70,
      width: 500,
      height: 360,
    });
    expect(state.activeLayout.floatingPanelIds.at(-1)).toBe('panel-terminal-1');
    expect(state.activeLayout.focusedPanelId).toBe('panel-terminal-1');
  });

  it('duplicates addressable hardware panels with independent device mappings', () => {
    let state = panelLayoutReducer(
      structuredClone(initialPanelLayoutState),
      resetToPreset('hardware-lab')
    );
    const source = Object.values(state.activeLayout.instances).find(
      (panel) => panel.kind === 'hardware-display'
    )!;
    state = panelLayoutReducer(state, duplicatePanel({ sourcePanelId: source.id }));
    const displays = Object.values(state.activeLayout.instances)
      .map((panel) => panel.config)
      .filter(
        (config): config is Extract<typeof config, { kind: 'hardware-display' }> =>
          config.kind === 'hardware-display'
      );

    expect(displays).toHaveLength(2);
    expect(new Set(displays.map((config) => config.deviceId)).size).toBe(2);
    expect(new Set(displays.map((config) => config.displayBase)).size).toBe(2);
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('stores normalized bit labels as panel metadata without changing device addresses', () => {
    let state = panelLayoutReducer(
      structuredClone(initialPanelLayoutState),
      resetToPreset('hardware-lab')
    );
    const digital = Object.values(state.activeLayout.instances).find(
      (panel) => panel.kind === 'hardware-digital-io'
    )!;
    const addresses =
      digital.config.kind === 'hardware-digital-io'
        ? {
            ledAddress: digital.config.ledAddress,
            switchAddress: digital.config.switchAddress,
            buttonAddress: digital.config.buttonAddress,
          }
        : null;

    state = panelLayoutReducer(
      state,
      commitDigitalIoBitLabel({ panelId: digital.id, bit: 7, label: `  ${'M'.repeat(40)}  ` })
    );
    const updated = state.activeLayout.instances[digital.id]!.config;
    expect(updated.kind).toBe('hardware-digital-io');
    if (updated.kind !== 'hardware-digital-io') return;
    expect(updated.bitLabels[7]).toBe('M'.repeat(32));
    expect(updated).toMatchObject(addresses!);

    state = panelLayoutReducer(state, saveView({ name: 'Labeled lab' }));
    const saved = state.userViews[state.userViewOrder[0]!]!.document.instances[digital.id]!.config;
    expect(saved.kind === 'hardware-digital-io' ? saved.bitLabels[7] : null).toBe('M'.repeat(32));
  });

  it('creates every registered panel kind through the shared targeted action', () => {
    let state = panelLayoutReducer(
      structuredClone(initialPanelLayoutState),
      resetToPreset('terminal-focus')
    );
    for (const kind of PANEL_KINDS) {
      state = panelLayoutReducer(
        state,
        createPanel({ kind, target: { columnId: 'column-1', index: 0 } })
      );
    }

    const kinds = Object.values(state.activeLayout.instances).map((panel) => panel.kind);
    for (const kind of PANEL_KINDS) expect(kinds).toContain(kind);
    expect(state.activeLayout.columns[0]!.panelIds).toHaveLength(PANEL_KINDS.length + 1);
    expect(state.activeLayout.focusedPanelId).toBe(
      `panel-${PANEL_KINDS.at(-1)!}-${PANEL_KINDS.length + 1}`
    );
    expect(state.activeLayout.terminalOwnerPanelId).toBe('panel-terminal-1');
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('preserves exact target ordering and refuses creation at the panel limit', () => {
    let state = panelLayoutReducer(
      structuredClone(initialPanelLayoutState),
      resetToPreset('terminal-focus')
    );
    state = panelLayoutReducer(
      state,
      createPanel({ kind: 'code', target: { columnId: 'column-1', index: 0 } })
    );
    state = panelLayoutReducer(
      state,
      createPanel({ kind: 'memory', target: { columnId: 'column-1', index: 1 } })
    );
    expect(
      state.activeLayout.columns[0]!.panelIds.map((id) => state.activeLayout.instances[id]!.kind)
    ).toEqual(['code', 'memory', 'terminal']);

    while (Object.keys(state.activeLayout.instances).length < MAX_PANEL_INSTANCES) {
      state = panelLayoutReducer(state, createPanel({ kind: 'help' }));
    }
    const instanceIds = Object.keys(state.activeLayout.instances);
    const nextSequence = state.activeLayout.nextInstanceSequence;
    state = panelLayoutReducer(state, createPanel({ kind: 'registers' }));
    expect(Object.keys(state.activeLayout.instances)).toEqual(instanceIds);
    expect(state.activeLayout.nextInstanceSequence).toBe(nextSequence);
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('does not mutate layout placement when panel configuration allocation fails', () => {
    const createConfiguration = vi
      .spyOn(panelLayoutTypes, 'createPanelConfiguration')
      .mockImplementation((_kind: PanelKind) => {
        throw new Error('No address range available');
      });
    try {
      const initial = structuredClone(initialPanelLayoutState);
      const next = panelLayoutReducer(initial, createPanel({ kind: 'hardware-display' }));
      expect(next).toEqual(initialPanelLayoutState);
    } finally {
      createConfiguration.mockRestore();
    }
  });

  it('migrates a legacy composite hardware panel into three focused panel kinds', () => {
    const migrated = normalizePanelLayoutDocument({
      schemaVersion: 1,
      name: 'Legacy lab',
      columnCount: 1,
      columns: [{ id: 'column-1', width: 100, panelIds: ['legacy-hardware'] }],
      floatingPanelIds: [],
      instances: {
        'legacy-hardware': {
          id: 'legacy-hardware',
          kind: 'hardware',
          title: 'Hardware I/O',
          minimized: false,
          config: { kind: 'hardware' },
        },
      },
      focusedPanelId: 'legacy-hardware',
      terminalOwnerPanelId: null,
      nextInstanceSequence: 2,
      nextColumnSequence: 2,
    });

    expect(migrated.schemaVersion).toBe(7);
    expect(Object.values(migrated.instances).map((panel) => panel.kind)).toEqual([
      'hardware-display',
      'hardware-digital-io',
      'hardware-interrupts',
    ]);
    expect(migrated.columns[0]?.panelIds).toHaveLength(3);
    expect(normalizePanelLayoutDocument(migrated)).toEqual(migrated);
  });

  it('migrates version-two hardware into separate digital I/O and IRQ panels', () => {
    const migrated = normalizePanelLayoutDocument({
      schemaVersion: 2,
      name: 'Split hardware lab',
      columnCount: 1,
      columns: [
        {
          id: 'column-1',
          width: 100,
          panelIds: ['digital', 'interrupts'],
        },
      ],
      floatingPanelIds: [],
      instances: {
        digital: {
          id: 'digital',
          kind: 'hardware-digital-io',
          title: 'LEDs / Switches / Buttons',
          minimized: false,
          config: {
            kind: 'hardware-digital-io',
            deviceId: 'device-digital',
            ledAddress: 0xe00010,
            switchAddress: 0xe00010,
            buttonAddress: 0xe00012,
          },
        },
        interrupts: {
          id: 'interrupts',
          kind: 'hardware-interrupts',
          title: 'Interrupt requests',
          minimized: false,
          config: { kind: 'hardware-interrupts' },
        },
      },
      focusedPanelId: 'interrupts',
      terminalOwnerPanelId: null,
      nextInstanceSequence: 3,
      nextColumnSequence: 2,
    });

    expect(migrated.schemaVersion).toBe(7);
    expect(Object.keys(migrated.instances)).toEqual(['digital', 'digital-interrupts']);
    expect(migrated.instances.digital?.title).toBe('LEDs / Switches / Buttons');
    expect(migrated.instances['digital-interrupts']?.kind).toBe('hardware-interrupts');
    expect(migrated.focusedPanelId).toBe('digital');
    expect(getPanelLayoutInvariantErrors(migrated)).toEqual([]);
  });

  it('normalizes version-four labels and adds one idempotent IRQ panel', () => {
    const migrated = normalizePanelLayoutDocument({
      schemaVersion: 4,
      name: 'Labeled hardware',
      columnCount: 1,
      columns: [{ id: 'column-1', width: 100, panelIds: ['digital'] }],
      floatingPanelIds: [],
      instances: {
        digital: {
          id: 'digital',
          kind: 'hardware-digital-io',
          title: 'LEDs / Switches / Buttons / IRQs',
          minimized: false,
          config: {
            kind: 'hardware-digital-io',
            deviceId: 'device-digital',
            ledAddress: 0xe00010,
            switchAddress: 0xe00010,
            buttonAddress: 0xe00012,
            bitLabels: ['  Zero  ', 3, '', '', '', '', '', 'X'.repeat(40)],
          },
        },
      },
      focusedPanelId: 'digital',
      terminalOwnerPanelId: null,
      nextInstanceSequence: 2,
      nextColumnSequence: 2,
    });

    expect(migrated.instances.digital?.title).toBe('LEDs / Switches / Buttons');
    const digital = migrated.instances.digital?.config;
    expect(digital?.kind === 'hardware-digital-io' ? digital.bitLabels : null).toEqual([
      'Zero',
      '',
      '',
      '',
      '',
      '',
      '',
      'X'.repeat(32),
    ]);
    expect(
      Object.values(migrated.instances).filter((panel) => panel.kind === 'hardware-interrupts')
    ).toHaveLength(1);
    expect(normalizePanelLayoutDocument(migrated)).toEqual(migrated);
  });

  it('does not add an IRQ panel when a version-four layout is at the panel limit', () => {
    const helpIds = Array.from(
      { length: MAX_PANEL_INSTANCES - 1 },
      (_, index) => `help-${index + 1}`
    );
    const instances = Object.fromEntries([
      [
        'digital',
        {
          id: 'digital',
          kind: 'hardware-digital-io',
          title: 'LEDs / Switches / Buttons / IRQs',
          minimized: false,
          config: {
            kind: 'hardware-digital-io',
            deviceId: 'device-digital',
            ledAddress: 0xe00010,
            switchAddress: 0xe00010,
            buttonAddress: 0xe00012,
          },
        },
      ],
      ...helpIds.map((id) => [
        id,
        { id, kind: 'help', title: 'Help', minimized: false, config: { kind: 'help' } },
      ]),
    ]);

    const migrated = normalizePanelLayoutDocument({
      schemaVersion: 4,
      name: 'Full hardware layout',
      columnCount: 1,
      columns: [{ id: 'column-1', width: 100, panelIds: ['digital', ...helpIds] }],
      floatingPanelIds: [],
      instances,
      focusedPanelId: 'digital',
      terminalOwnerPanelId: null,
      nextInstanceSequence: MAX_PANEL_INSTANCES + 1,
      nextColumnSequence: 2,
    });

    expect(Object.keys(migrated.instances)).toHaveLength(MAX_PANEL_INSTANCES);
    expect(
      Object.values(migrated.instances).filter((panel) => panel.kind === 'hardware-interrupts')
    ).toHaveLength(0);
    expect(migrated.instances.digital?.title).toBe('LEDs / Switches / Buttons');
  });
});
