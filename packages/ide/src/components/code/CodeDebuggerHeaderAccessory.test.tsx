import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CodeDebuggerHeaderAccessory from './CodeDebuggerHeaderAccessory';
import {
  createIdeStore,
  setExecutionState,
  setEditorCursorPosition,
  setRuntimeSessionMetadata,
  syncDebugSnapshot,
} from '@/store';
import { executionCoordinator } from '@/runtime/executionCoordinator';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function readyStore() {
  const store = createIdeStore();
  const fileId = store.getState().files.activeFileId;
  store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'in-process' }));
  store.dispatch(setEditorCursorPosition({ column: 1, line: 4 }));
  store.dispatch(
    syncDebugSnapshot({
      status: 'paused',
      stop: {
        reason: 'breakpoint',
        pc: 0x1006,
        source: { fileId, line: 4 },
      },
      breakpoints: [],
      callStack: [{ address: 0x1000, id: 'frame-1', kind: 'subroutine', name: 'MAIN' }],
      logs: [],
      program: {
        endAddress: 0x1010,
        entryPoint: 0x1000,
        fileId,
        fingerprint: 'header-test',
        loadAddress: 0x1000,
        sourceMap: [{ address: 0x1006, kind: 'instruction', length: 2, line: 4 }],
        symbols: {},
      },
      watches: [],
      watchpoints: [],
    })
  );
  return store;
}

function waitingStore() {
  const store = createIdeStore();
  const fileId = store.getState().files.activeFileId;
  store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'in-process' }));
  store.dispatch(setExecutionState({ started: true, ended: false, stopped: true }));
  store.dispatch(
    syncDebugSnapshot({
      status: 'waiting',
      stop: {
        reason: 'waiting-for-input',
        pc: 0x1006,
        source: { fileId, line: 4 },
      },
      breakpoints: [],
      callStack: [{ address: 0x1000, id: 'frame-1', kind: 'subroutine', name: 'READ_INPUT' }],
      logs: [],
      program: {
        endAddress: 0x1010,
        entryPoint: 0x1000,
        fileId,
        fingerprint: 'waiting-header-test',
        loadAddress: 0x1000,
        sourceMap: [{ address: 0x1006, kind: 'instruction', length: 2, line: 4 }],
        symbols: {},
      },
      watches: [],
      watchpoints: [],
    })
  );
  return store;
}

describe('CodeDebuggerHeaderAccessory', () => {
  it('renders one ordinary Debug button while running and pauses through the coordinator', () => {
    const store = createIdeStore();
    store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'in-process' }));
    store.dispatch(setExecutionState({ started: true, ended: false, stopped: false }));
    store.dispatch(
      syncDebugSnapshot({
        status: 'running',
        breakpoints: [],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );
    const execute = vi.spyOn(executionCoordinator, 'execute').mockImplementation(() => {});
    renderWithIdeProviders(<CodeDebuggerHeaderAccessory />, { store });

    expect(screen.getByRole('button', { name: 'Pause for debugging' })).toHaveTextContent('Debug');
    expect(screen.queryByRole('button', { name: 'Step into' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause for debugging' }));
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('pause');
    expect(screen.getByRole('button', { name: 'Pause for debugging' })).toBeDisabled();
  });

  it('runs the code-scoped debugger commands from the panel header', () => {
    const store = readyStore();
    const execute = vi.spyOn(executionCoordinator, 'execute').mockImplementation(() => {});
    const runToAddress = vi
      .spyOn(executionCoordinator, 'runToAddress')
      .mockImplementation(() => {});
    renderWithIdeProviders(<CodeDebuggerHeaderAccessory />, { store });

    expect(screen.getByText('Debug')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Code debugging controls' })).toHaveClass(
      'code-debugger-header-controls'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Step backward' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step over' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step into' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run to cursor' }));

    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      'stepBack',
      'stepOver',
      'stepInto',
      'stepOut',
    ]);
    expect(runToAddress).toHaveBeenCalledWith(0x1006);
  });

  it('disables commands which require runtime or source-map state', () => {
    renderWithIdeProviders(<CodeDebuggerHeaderAccessory />, { store: createIdeStore() });

    expect(screen.getByRole('button', { name: 'Pause for debugging' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Step backward' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Step into' })).not.toBeInTheDocument();
  });

  it.fails('offers an inspect action with truthful messaging while waiting for input', () => {
    renderWithIdeProviders(<CodeDebuggerHeaderAccessory />, { store: waitingStore() });

    const debugButton = screen.getByRole('button', { name: 'Inspect waiting instruction' });
    expect(debugButton).toBeEnabled();
    expect(debugButton).toHaveAttribute('title', 'Inspect the instruction waiting for input');
    expect(
      screen.queryByText('Start the program before pausing for debugging')
    ).not.toBeInTheDocument();
  });

  it.fails('expands every duplicate Code header from one shared waiting-inspection request', () => {
    const store = waitingStore();
    renderWithIdeProviders(
      <>
        <CodeDebuggerHeaderAccessory />
        <CodeDebuggerHeaderAccessory />
      </>,
      { store }
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect waiting instruction' })[0]!);

    expect(
      screen
        .getAllByRole('toolbar', { name: 'Code debugging controls' })
        .map((toolbar) => toolbar.getAttribute('data-expanded'))
    ).toEqual(['true', 'true']);
    expect(screen.getAllByRole('button', { name: 'Step backward' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Step into' })[0]).toBeDisabled();
  });

  it('keeps primary steps visible and moves secondary commands into an overflow menu', () => {
    class ImmediateResizeObserver implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      disconnect(): void {}
      observe(target: Element): void {
        this.callback(
          [
            {
              borderBoxSize: [],
              contentBoxSize: [],
              contentRect: target.getBoundingClientRect(),
              devicePixelContentBoxSize: [],
              target,
            },
          ],
          this
        );
      }
      unobserve(): void {}
    }
    vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return {
        bottom: 40,
        height: 40,
        left: 0,
        right: 360,
        top: 0,
        width: this.classList.contains('panel-frame-header') ? 360 : 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });

    renderWithIdeProviders(
      <div className="panel-frame-header">
        <CodeDebuggerHeaderAccessory />
      </div>,
      { store: readyStore() }
    );
    expect(screen.getByRole('button', { name: 'Step over' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Step into' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Step out' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More debugging controls' }));
    expect(screen.getByRole('menuitem', { name: /step backward/i })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /step out/i })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /run to cursor/i })).toBeVisible();
  });
});
