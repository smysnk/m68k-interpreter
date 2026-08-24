import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Editor from './Editor';
import {
  addSourceBreakpoint,
  clearBreakpoints,
  createIdeStore,
  markDebugSourceStale,
  markDebugSourceSynchronized,
  setEditorCode,
  setLineNumbers,
  syncDebugSnapshot,
} from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

const SOURCE = `START
  MOVEQ #0,D0
LOOP
  ADDQ.L #1,D0
  BRA LOOP`;

function lineNumber(label: string): HTMLElement {
  const result = Array.from(
    document.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')
  ).find((element) => element.textContent === label);
  if (!result) throw new Error(`Missing line number ${label}`);
  return result;
}

describe('Editor debugger gutters', () => {
  it('toggles a breakpoint by clicking the printed line number', () => {
    const store = createIdeStore();
    store.dispatch(clearBreakpoints());
    store.dispatch(setEditorCode(SOURCE));
    renderWithIdeProviders(<Editor />, { store });

    fireEvent.mouseDown(lineNumber('1'), { button: 0 });
    expect(store.getState().debugger.configuration.breakpoints).toEqual([
      expect.objectContaining({
        enabled: true,
        fileId: store.getState().files.activeFileId,
        kind: 'source',
        line: 1,
      }),
    ]);

    fireEvent.mouseDown(lineNumber('1'), { button: 0 });
    expect(store.getState().debugger.configuration.breakpoints).toHaveLength(0);
  });

  it('opens breakpoint actions from the printed line-number context menu', () => {
    const store = createIdeStore();
    store.dispatch(clearBreakpoints());
    store.dispatch(setEditorCode(SOURCE));
    renderWithIdeProviders(<Editor />, { store });

    fireEvent.contextMenu(lineNumber('1'), { clientX: 80, clientY: 100 });
    expect(screen.getByRole('menu', { name: 'Breakpoint actions' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add breakpoint' })).toBeInTheDocument();
  });

  it('keeps the interactive debugger gutter when line numbers are hidden', () => {
    const store = createIdeStore();
    store.dispatch(setEditorCode(SOURCE));
    store.dispatch(setLineNumbers(false));
    renderWithIdeProviders(<Editor />, { store });

    expect(document.querySelector('.cm-lineNumbers')).not.toBeInTheDocument();
    expect(document.querySelector('.cm-debugger-gutter')).toBeInTheDocument();
  });

  it('shows the current instruction and breakpoint together on one source line', () => {
    const store = createIdeStore();
    const fileId = store.getState().files.activeFileId;
    store.dispatch(setEditorCode(SOURCE));
    store.dispatch(markDebugSourceSynchronized());
    store.dispatch(addSourceBreakpoint({ fileId, id: 'breakpoint-4', line: 4 }));
    store.dispatch(
      syncDebugSnapshot({
        status: 'paused',
        stop: { pc: 0x1006, reason: 'breakpoint', source: { fileId, line: 4 } },
        breakpoints: [
          {
            address: 0x1006,
            addresses: [0x1006],
            bound: true,
            enabled: true,
            fileId,
            hitCount: 0,
            id: 'breakpoint-4',
            kind: 'source',
            line: 4,
          },
        ],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );
    renderWithIdeProviders(<Editor />, { store });

    const composite = Array.from(document.querySelectorAll('.debug-line-marker')).find(
      (marker) =>
        marker.querySelector('.debug-breakpoint-marker') &&
        marker.querySelector('.debug-current-instruction-marker')
    );
    expect(composite).toBeInTheDocument();
  });

  it('does not show a stopped-line marker after the source becomes stale', () => {
    const store = createIdeStore();
    const fileId = store.getState().files.activeFileId;
    store.dispatch(setEditorCode(SOURCE));
    store.dispatch(markDebugSourceSynchronized());
    store.dispatch(
      syncDebugSnapshot({
        status: 'paused',
        stop: { pc: 0x1006, reason: 'manual-pause', source: { fileId, line: 4 } },
        breakpoints: [],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );
    store.dispatch(markDebugSourceStale());

    renderWithIdeProviders(<Editor />, { store });

    expect(document.querySelector('.cm-debug-current-line')).not.toBeInTheDocument();
    expect(document.querySelector('.debug-current-instruction-marker')).not.toBeInTheDocument();
  });

  it('does not show a historical stop after the debug session has completed', () => {
    const store = createIdeStore();
    const fileId = store.getState().files.activeFileId;
    store.dispatch(setEditorCode(SOURCE));
    store.dispatch(markDebugSourceSynchronized());
    store.dispatch(
      syncDebugSnapshot({
        status: 'halted',
        stop: { pc: 0x1006, reason: 'completed', source: { fileId, line: 4 } },
        breakpoints: [],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );

    renderWithIdeProviders(<Editor />, { store });

    expect(document.querySelector('.cm-debug-current-line')).not.toBeInTheDocument();
    expect(document.querySelector('.debug-current-instruction-marker')).not.toBeInTheDocument();
  });
});
