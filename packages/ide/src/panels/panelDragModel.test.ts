import { describe, expect, it } from 'vitest';
import { createPanelPreset } from '@/panels/panelPresets';
import {
  calculateDroppedFloatingRect,
  createPanelDockTargets,
  describePanelDockTarget,
  getPanelDragSource,
  isNoOpPanelDock,
  normalizePanelDockIndex,
} from './panelDragModel';

describe('panelDragModel', () => {
  it('creates stable before, between, and after targets', () => {
    const document = createPanelPreset('classic');
    const targets = createPanelDockTargets(document, document.columns[0]!.id, 0);
    expect(targets.map((target) => target.relation)).toEqual(['before', 'after']);
    expect(targets.map((target) => target.id)).toEqual([
      'dock:column-1:0',
      'dock:column-1:1',
    ]);
  });

  it('creates one large target for an empty column', () => {
    const document = createPanelPreset('debug');
    document.columns[2]!.panelIds = [];
    const targets = createPanelDockTargets(document, document.columns[2]!.id, 2);
    expect(targets).toMatchObject([{ index: 0, relation: 'empty', columnIndex: 2 }]);
  });

  it('normalizes same-column insertion slots and detects no-op drops', () => {
    const document = createPanelPreset('hardware-lab');
    const column = document.columns[1]!;
    const source = getPanelDragSource(document, column.panelIds[0]!)!;
    const target = createPanelDockTargets(document, column.id, 1).at(-1)!;
    expect(normalizePanelDockIndex(source, target)).toBe(column.panelIds.length - 1);
    expect(isNoOpPanelDock(source, createPanelDockTargets(document, column.id, 1)[1]!)).toBe(true);
  });

  it('converts client-space drops into reachable layer-relative floating rectangles', () => {
    expect(calculateDroppedFloatingRect({
      delta: { x: 900, y: 600 },
      initialClientRect: { x: 100, y: 100, width: 520, height: 420 },
      layerClientRect: { x: 20, y: 60, width: 800, height: 500 },
    })).toEqual({ x: 752, y: 460, width: 520, height: 420 });
  });

  it('describes exact semantic placement for announcements', () => {
    const document = createPanelPreset('hardware-lab');
    const column = document.columns[1]!;
    const target = createPanelDockTargets(document, column.id, 1)[1]!;
    expect(describePanelDockTarget(target, 'Screen', document)).toBe(
      'Dock Screen between Hardware I/O and Registers in column 2',
    );
  });
});
