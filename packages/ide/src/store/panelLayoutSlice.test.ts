import { describe, expect, it } from 'vitest';
import panelLayoutReducer, {
  closePanel,
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
import { getPanelLayoutInvariantErrors, normalizePanelLayoutDocument } from './panelLayoutValidation';

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
    const mirrorId = Object.values(state.activeLayout.instances).find((panel) => panel.kind === 'terminal' && panel.id !== 'panel-terminal-1')!.id;
    state = panelLayoutReducer(state, setTerminalOwner(mirrorId));
    state = panelLayoutReducer(state, togglePanelMinimized(mirrorId));
    expect(state.activeLayout.terminalOwnerPanelId).toBe('panel-terminal-1');
    state = panelLayoutReducer(state, floatPanel({ panelId: mirrorId, rect: { x: -8, y: -4, width: 10, height: 10 } }));
    expect(state.activeLayout.instances[mirrorId]?.floatingRect).toMatchObject({ x: 0, y: 0, width: 280, height: 180 });
    state = panelLayoutReducer(state, movePanel({ panelId: mirrorId, columnId: state.activeLayout.columns[1]!.id, index: 0 }));
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
    expect(state.activeLayout.columns[0]?.panelIds.some((id) => state.activeLayout.instances[id]?.kind === 'memory')).toBe(true);
    expect(getPanelLayoutInvariantErrors(state.activeLayout)).toEqual([]);
  });

  it('saves immutable snapshots and resets to built-in views', () => {
    let state = reduce([createPanel({ kind: 'hardware' }), saveView({ name: 'Lab' })]);
    const viewId = state.userViewOrder[0]!;
    const savedCount = Object.keys(state.userViews[viewId]!.document.instances).length;
    state = panelLayoutReducer(state, createPanel({ kind: 'help' }));
    expect(Object.keys(state.userViews[viewId]!.document.instances)).toHaveLength(savedCount);
    state = panelLayoutReducer(state, resetToPreset('terminal-focus'));
    expect(state.activeLayout.columnCount).toBe(1);
    expect(state.activeLayoutDirty).toBe(false);
  });

  it('repairs corrupt placement, owner, widths, and floating rectangles', () => {
    const normalized = normalizePanelLayoutDocument({
      name: 'Damaged', columnCount: 2,
      instances: {
        a: { id: 'a', kind: 'terminal', title: 'A', minimized: false, config: {} },
        b: { id: 'b', kind: 'memory', title: 'B', minimized: false, floatingRect: { x: NaN, y: -3, width: 1, height: 1 }, config: {} },
      },
      columns: [{ id: 'one', width: NaN, panelIds: ['a', 'a', 'missing'] }],
      floatingPanelIds: ['b', 'a'], terminalOwnerPanelId: 'b', focusedPanelId: 'missing',
    });
    expect(getPanelLayoutInvariantErrors(normalized)).toEqual([]);
    expect(normalized.terminalOwnerPanelId).toBe('a');
    expect(normalized.instances.b?.floatingRect).toMatchObject({ x: 32, y: 0, width: 280, height: 180 });
  });

  it('moves, focuses, and raises a floating panel in one semantic reducer action', () => {
    let state = reduce([
      floatPanel({ panelId: 'panel-terminal-1' }),
      floatPanel({ panelId: 'panel-registers-2' }),
    ]);
    state = panelLayoutReducer(state, moveFloatingPanel({
      panelId: 'panel-terminal-1',
      rect: { x: 80, y: 70, width: 500, height: 360 },
    }));
    expect(state.activeLayout.instances['panel-terminal-1']?.floatingRect).toEqual({
      x: 80, y: 70, width: 500, height: 360,
    });
    expect(state.activeLayout.floatingPanelIds.at(-1)).toBe('panel-terminal-1');
    expect(state.activeLayout.focusedPanelId).toBe('panel-terminal-1');
  });
});
