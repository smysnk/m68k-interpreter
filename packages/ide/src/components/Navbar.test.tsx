import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import Navbar from './Navbar';
import {
  createIdeStore,
  confirmDebuggerPause,
  focusPanel,
  requestDebuggerPause,
  setEditorCode,
  setExecutionState,
  setRuntimeSessionMetadata,
  setRuntimeCommandPending,
  syncDebugSnapshot,
} from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';
import { executionCoordinator } from '@/runtime/executionCoordinator';

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  window.dispatchEvent(new Event('resize'));
}

function openViewMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^view$/i }));
}

describe('Navbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1280);
  });

  it('renders shell controls and drives the interface through Redux', () => {
    const executionSpy = vi.spyOn(executionCoordinator, 'execute');
    const store = createIdeStore();
    const onToggleFileExplorer = vi.fn();

    const { container } = renderWithIdeProviders(
      <Navbar fileExplorerOpen={false} onToggleFileExplorer={onToggleFileExplorer} />,
      { store }
    );

    expect(container.querySelector('.navbar-left')).toBeInTheDocument();
    expect(container.querySelector('.navbar-right')).toBeInTheDocument();
    expect(screen.queryByText('M68K IDE')).not.toBeInTheDocument();
    const fileExplorerButton = screen.getByRole('button', { name: /open file explorer/i });
    expect(fileExplorerButton).toHaveTextContent('68');
    expect(fileExplorerButton).toHaveAttribute('aria-controls', 'file-explorer-sidebar');
    fireEvent.click(fileExplorerButton);
    expect(onToggleFileExplorer).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /open view menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Workspace views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /terminal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /code/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delay (s)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Speed (x)')).toHaveValue(1);

    fireEvent.change(screen.getByLabelText('Speed (x)'), { target: { value: '2.5' } });
    fireEvent.click(
      screen
        .getAllByRole('button')
        .find((button) => button.getAttribute('aria-label') === 'Start program')!
    );
    expect(screen.getByRole('button', { name: /stop program/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /restart program/i })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /step into/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /step backward/i })).not.toBeInTheDocument();
    const initialTheme = store.getState().settings.editorTheme;
    const themeToggle = screen.getByTestId('navbar-theme-toggle');
    expect(themeToggle.querySelector('svg')).toHaveAttribute(
      'data-icon',
      initialTheme === EditorThemeEnum.M68K_DARK ? 'moon' : 'sun'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name:
          initialTheme === EditorThemeEnum.M68K_DARK
            ? /switch to light mode/i
            : /switch to dark mode/i,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    expect(screen.getByRole('menuitem', { name: /^view$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /style/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /m68k (light|dark)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /terminal input/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /line numbers/i }));

    expect(store.getState().settings.editorTheme).toBe(
      initialTheme === EditorThemeEnum.M68K_DARK
        ? EditorThemeEnum.M68K_LIGHT
        : EditorThemeEnum.M68K_DARK
    );
    expect(themeToggle.querySelector('svg')).toHaveAttribute(
      'data-icon',
      initialTheme === EditorThemeEnum.M68K_DARK ? 'sun' : 'moon'
    );
    expect(store.getState().settings.followSystemTheme).toBe(false);
    expect(store.getState().settings.lineNumbers).toBe(false);
    expect(store.getState().settings.terminalInputMode).toBe('auto');
    expect(store.getState().emulator.speedMultiplier).toBe(2.5);
    expect(screen.queryByRole('menuitem', { name: /registers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /memory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /flags/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /compatibility notes/i })
    ).not.toBeInTheDocument();
    expect(executionSpy.mock.calls.map(([command]) => command)).toEqual(['run']);
    expect(store.getState().emulator.runtimeIntents).toEqual({ focusTerminal: 0 });
  });

  it('starts a fresh runtime when the editor source changed after execution began', () => {
    const executionSpy = vi.spyOn(executionCoordinator, 'execute');
    const store = createIdeStore();
    store.dispatch(setExecutionState({ started: true, ended: false, stopped: true }));
    store.dispatch(setEditorCode('START\n  NOP\n  END START'));

    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    expect(store.getState().debugger.sourceStale).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Run updated source' }));
    expect(executionSpy).toHaveBeenCalledWith('run');
  });

  it('presents pause as debugging and uses shared pending state', () => {
    const store = createIdeStore();
    store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
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
    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    const pause = screen.getByRole('button', { name: 'Pause for debugging' });
    const running = screen.getByRole('button', { name: 'Program running' });
    expect(running).toBeDisabled();
    expect(running).toHaveAttribute('data-current-state', 'false');
    expect(screen.getByRole('button', { name: 'Stop program' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart program' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(pause).toHaveAttribute('title', 'Pause for debugging (F6)');
    expect(pause.querySelector('svg')).toHaveAttribute('data-icon', 'bug');
    fireEvent.click(pause);
    expect(execute).toHaveBeenCalledWith('pause');

    act(() => {
      store.dispatch(requestDebuggerPause());
    });
    expect(pause).toBeDisabled();
    expect(pause).toHaveAttribute('aria-busy', 'true');
    expect(pause).toHaveAttribute('data-current-state', 'true');
    expect(pause).toHaveAttribute('title', 'Pausing at the next instruction boundary');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('moves the current-state treatment from running to paused and lifecycle actions', () => {
    const store = createIdeStore();
    store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
    store.dispatch(setExecutionState({ started: false, ended: false, stopped: true }));
    store.dispatch(
      syncDebugSnapshot({
        status: 'paused',
        stop: { pc: 0x1006, reason: 'breakpoint' },
        breakpoints: [],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );
    store.dispatch(confirmDebuggerPause());
    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    expect(screen.getByRole('button', { name: 'Continue program' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Debugger paused' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Debugger paused' })).toHaveAttribute(
      'data-current-state',
      'true'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      store.dispatch(setRuntimeCommandPending('restart'));
    });
    const restarting = screen.getByRole('button', { name: 'Restarting program' });
    expect(restarting).toBeDisabled();
    expect(restarting).toHaveAttribute('aria-busy', 'true');
    expect(restarting).toHaveAttribute('data-current-state', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('changes columns and adds panels from the View menu', () => {
    const store = createIdeStore();
    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    openViewMenu();
    expect(screen.getByRole('menu', { name: /view options/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: '2 columns' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /columns/i }));
    expect(screen.getByRole('menuitemradio', { name: '2 columns' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: '3 columns' }));
    expect(store.getState().panelLayout.activeLayout.columnCount).toBe(3);

    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /add panel/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add memory panel/i }));
    expect(
      Object.values(store.getState().panelLayout.activeLayout.instances).some(
        (panel) => panel.kind === 'memory'
      )
    ).toBe(true);
    expect(screen.queryByRole('menu', { name: /view options/i })).not.toBeInTheDocument();
  });

  it('saves, applies, and restores workspace layouts from the View menu', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('My workspace');
    const store = createIdeStore();
    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /saved views/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /save view as/i }));
    const viewId = store.getState().panelLayout.userViewOrder[0]!;
    expect(store.getState().panelLayout.userViews[viewId]?.name).toBe('My workspace');

    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /layouts/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apply Debug layout' }));
    expect(store.getState().panelLayout.activeLayout.columnCount).toBe(3);

    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /saved views/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore My workspace layout' }));
    expect(store.getState().panelLayout.activeLayout.columnCount).toBe(2);
    expect(store.getState().panelLayout.activeSourceViewId).toBe(viewId);
    prompt.mockRestore();
  });

  it('shows mobile workspace tabs and hides runtime controls while terminal is active', () => {
    setViewportWidth(600);
    const store = createIdeStore();
    store.dispatch(focusPanel('panel-terminal-1'));

    renderWithIdeProviders(<Navbar fileExplorerOpen={false} onToggleFileExplorer={() => {}} />, {
      store,
    });

    expect(screen.queryByTestId('navbar-accent-mark')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /registers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /memory/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hardware/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open app menu/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Speed (x)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Start program')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(
      store.getState().panelLayout.activeLayout.instances[
        store.getState().panelLayout.activeLayout.focusedPanelId ?? ''
      ]?.kind
    ).toBe('code');
    expect(screen.getByRole('button', { name: /open app menu/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Speed (x)')).toBeInTheDocument();
    expect(screen.getByLabelText('Start program')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open file explorer/i })).toHaveTextContent('68');
  });
});
