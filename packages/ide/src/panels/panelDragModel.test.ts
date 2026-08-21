import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPanelPreset } from '@/panels/panelPresets';
import {
  calculateDroppedFloatingRect,
  createPanelDockTargets,
  describePanelDockTarget,
  getPanelDragSource,
  isNoOpPanelDock,
  normalizePanelDockIndex,
  fitPanelCreateTargetForKind,
  resolvePanelCreateTarget,
} from './panelDragModel';

function rect({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('panelDragModel', () => {
  it('creates stable before, between, and after targets', () => {
    const document = createPanelPreset('classic');
    const targets = createPanelDockTargets(document, document.columns[0]!.id, 0);
    expect(targets.map((target) => target.relation)).toEqual(['before', 'after']);
    expect(targets.map((target) => target.id)).toEqual(['dock:column-1:0', 'dock:column-1:1']);
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
    expect(
      calculateDroppedFloatingRect({
        delta: { x: 900, y: 600 },
        initialClientRect: { x: 100, y: 100, width: 520, height: 420 },
        layerClientRect: { x: 20, y: 60, width: 800, height: 500 },
      })
    ).toEqual({ x: 752, y: 460, width: 520, height: 420 });
  });

  it('describes exact semantic placement for announcements', () => {
    const document = createPanelPreset('hardware-lab');
    const column = document.columns[1]!;
    const target = createPanelDockTargets(document, column.id, 1)[1]!;
    expect(describePanelDockTarget(target, 'Screen', document)).toBe(
      'Dock Screen after Seven-segment display in column 2'
    );
  });

  it('resolves before, after, and empty-space docked insertion targets', () => {
    const layout = createPanelPreset('debug');
    const workspace = document.createElement('div');
    const column = document.createElement('section');
    const firstPanel = document.createElement('article');
    const secondPanel = document.createElement('article');
    column.dataset.panelColumnId = layout.columns[2]!.id;
    firstPanel.dataset.panelInstanceId = layout.columns[2]!.panelIds[0]!;
    secondPanel.dataset.panelInstanceId = layout.columns[2]!.panelIds[1]!;
    column.append(firstPanel, secondPanel);
    workspace.append(column);
    document.body.append(workspace);
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(
      rect({ height: 600, left: 0, top: 0, width: 900 })
    );
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(
      rect({ height: 600, left: 600, top: 0, width: 300 })
    );
    vi.spyOn(firstPanel, 'getBoundingClientRect').mockReturnValue(
      rect({ height: 200, left: 600, top: 50, width: 300 })
    );
    vi.spyOn(secondPanel, 'getBoundingClientRect').mockReturnValue(
      rect({ height: 200, left: 600, top: 250, width: 300 })
    );

    expect(
      resolvePanelCreateTarget({
        clientX: 700,
        clientY: 80,
        document: layout,
        eventTarget: firstPanel,
        workspaceElement: workspace,
      })
    ).toEqual({ columnId: layout.columns[2]!.id, index: 0 });
    expect(
      resolvePanelCreateTarget({
        clientX: 700,
        clientY: 180,
        document: layout,
        eventTarget: firstPanel,
        workspaceElement: workspace,
      })
    ).toEqual({ columnId: layout.columns[2]!.id, index: 1 });
    expect(
      resolvePanelCreateTarget({
        clientX: 700,
        clientY: 580,
        document: layout,
        eventTarget: column,
        workspaceElement: workspace,
      })
    ).toEqual({ columnId: layout.columns[2]!.id, index: 2 });
  });

  it('uses index zero for empty columns and inserts after the compact focused panel', () => {
    const layout = createPanelPreset('debug');
    layout.columns[2]!.panelIds = [];
    const workspace = document.createElement('div');
    const column = document.createElement('section');
    column.dataset.panelColumnId = layout.columns[2]!.id;
    workspace.append(column);
    document.body.append(workspace);

    expect(
      resolvePanelCreateTarget({
        clientX: 700,
        clientY: 300,
        document: layout,
        eventTarget: column,
        workspaceElement: workspace,
      })
    ).toEqual({ columnId: layout.columns[2]!.id, index: 0 });

    layout.focusedPanelId = layout.columns[1]!.panelIds[0]!;
    expect(
      resolvePanelCreateTarget({
        clientX: 10,
        clientY: 10,
        compact: true,
        document: layout,
        eventTarget: workspace,
        workspaceElement: workspace,
      })
    ).toEqual({ columnId: layout.columns[1]!.id, index: 1 });
  });

  it('captures floating pointer placement and fits the selected panel within the workspace', () => {
    const layout = createPanelPreset('classic');
    const floatingId = layout.columns[0]!.panelIds[0]!;
    layout.columns[0]!.panelIds = [];
    layout.floatingPanelIds = [floatingId];
    layout.instances[floatingId]!.floatingRect = { x: 20, y: 20, width: 520, height: 420 };
    const workspace = document.createElement('div');
    const floatingPanel = document.createElement('article');
    floatingPanel.dataset.panelInstanceId = floatingId;
    workspace.append(floatingPanel);
    document.body.append(workspace);
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(
      rect({ height: 640, left: 100, top: 50, width: 1000 })
    );

    const target = resolvePanelCreateTarget({
      clientX: 1050,
      clientY: 620,
      document: layout,
      eventTarget: floatingPanel,
      workspaceElement: workspace,
    });
    expect(target.floatingRect).toMatchObject({ x: 962, y: 582 });
    expect(
      fitPanelCreateTargetForKind({
        kind: 'hardware-digital-io',
        target,
        workspaceHeight: 640,
        workspaceWidth: 1000,
      })
    ).toEqual({ floatingRect: { x: 280, y: 200, width: 720, height: 440 } });
  });
});
