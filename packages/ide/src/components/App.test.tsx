import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { AppShell } from './App';
import { nibblesSource } from '@/programs/nibbles';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { createIdeStore, ideStore, resetFilesState, resetSettingsState, setActiveFile, setEngineMode } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { IDE_PERSISTENCE_KEY } from '@/store/persistence';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

function openAppMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
}

function openStyleMenu(): void {
  openAppMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: /style/i }));
}

function mockSystemTheme(theme: 'light' | 'dark'): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? theme === 'dark' : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('App', () => {
  beforeEach(() => {
    mockSystemTheme('light');
    window.localStorage.clear();
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetFilesState());
    ideStore.dispatch(resetSettingsState());
    window.editorCode = '';
    window.emulatorInstance = null;
  });

  it('loads the selected sidebar file into the editor', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(await screen.findByRole('button', { name: /scratch\.asm/i }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
      expect(useEmulatorStore.getState().editorCode).toContain('Write your M68K assembly code here');
    });

    fireEvent.click(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(await screen.findByRole('button', { name: /nibbles\.asm/i }));

    await waitFor(() => {
      expect(useEmulatorStore.getState().editorCode).toBe(nibblesSource);
      expect(window.editorCode).toContain('END NIBBLES');
    });
  });

  it('defaults the workspace to the terminal tab and lets the user switch to code', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('assembly-editor')).toBeInTheDocument();
  });

  it('keeps Nibbles selected in the persisted file state', () => {
    render(<App />);

    expect(ideStore.getState().files.activeFileId).toBe('example:nibbles.asm');
  });

  it('forces the default Interpreter engine when opening Nibbles from the sidebar', () => {
    ideStore.dispatch(setEngineMode('interpreter-redux'));
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));

    render(<App />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('stores the selected interpreter engine in Redux and resets the active runtime', () => {
    render(<App />);

    useEmulatorStore.getState().setEmulatorInstance({
      emulationStep: vi.fn(),
      getCFlag: vi.fn(() => 0),
      getCCR: vi.fn(() => 0),
      getErrors: vi.fn(() => []),
      getException: vi.fn(() => undefined),
      getLastInstruction: vi.fn(() => 'Ready'),
      getMemory: vi.fn(() => ({})),
      getMemoryMeta: vi.fn(() => ({
        usedBytes: 0,
        minAddress: null,
        maxAddress: null,
        version: 1,
      })),
      getNFlag: vi.fn(() => 0),
      getPC: vi.fn(() => 0),
      getQueuedInputLength: vi.fn(() => 0),
      getRegisters: vi.fn(() => new Int32Array(16)),
      getSR: vi.fn(() => 0),
      getSSP: vi.fn(() => 0),
      readMemoryRange: vi.fn((_: number, length: number) => new Uint8Array(length)),
      getSymbolAddress: vi.fn(() => undefined),
      getSymbols: vi.fn(() => ({})),
      getTerminalFrameBuffer: vi.fn(() => terminalSurfaceStore.getSnapshot().frameBuffer),
      getTerminalLines: vi.fn(() => ['']),
      getTerminalMeta: vi.fn(() => terminalSurfaceStore.getSnapshot().meta),
      getTerminalText: vi.fn(() => ''),
      getTerminalSnapshot: vi.fn(() => ({
        columns: 80,
        rows: 25,
        cursorRow: 0,
        cursorColumn: 0,
        output: '',
        lines: [],
        cells: [],
      })),
      getUSP: vi.fn(() => 0),
      getVFlag: vi.fn(() => 0),
      getXFlag: vi.fn(() => 0),
      getZFlag: vi.fn(() => 0),
      isHalted: vi.fn(() => false),
      isWaitingForInput: vi.fn(() => false),
      queueInput: vi.fn(),
      reset: vi.fn(),
      undoFromStack: vi.fn(),
      clearInputQueue: vi.fn(),
    });
    window.emulatorInstance = useEmulatorStore.getState().emulatorInstance;

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));
    fireEvent.click(screen.getByRole('option', { name: /interpreter redux/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter-redux');
    expect(useEmulatorStore.getState().emulatorInstance).toBeNull();
    expect(window.emulatorInstance).toBeNull();
  });

  it('switches the right pane between registers and memory tabs', () => {
    render(<App />);

    const registersTab = screen.getByRole('tab', { name: /registers/i });
    const memoryTab = screen.getByRole('tab', { name: /memory/i });

    expect(registersTab).toHaveAttribute('aria-selected', 'true');
    expect(memoryTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Flags')).toBeInTheDocument();

    fireEvent.click(memoryTab);

    expect(registersTab).toHaveAttribute('aria-selected', 'false');
    expect(memoryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Start Address')).toBeInTheDocument();
  });

  it('hydrates theme and shell preferences from persisted storage', () => {
    window.localStorage.setItem(
      IDE_PERSISTENCE_KEY,
      JSON.stringify({
        settings: {
          editorTheme: EditorThemeEnum.M68K_DARK,
          followSystemTheme: false,
          lineNumbers: true,
          engineMode: 'interpreter',
        },
        uiShell: {
          workspaceTab: 'code',
          inspectorView: 'memory',
          contextView: 'help',
          contextOpen: true,
          layout: {
            rootHorizontal: [59, 41],
            rootHorizontalWithContext: [47, 33, 20],
            inspectorVertical: [52, 48],
          },
        },
        files: {
          activeFileId: 'workspace:scratch.asm',
          items: [
            {
              id: 'workspace:scratch.asm',
              name: 'scratch.asm',
              path: 'workspace/scratch.asm',
              kind: 'workspace',
              content: 'MOVE.L #7,D0',
            },
            {
              id: 'example:nibbles.asm',
              name: 'nibbles.asm',
              path: 'examples/nibbles.asm',
              kind: 'example',
              content: nibblesSource,
            },
          ],
        },
      })
    );

    const store = createIdeStore();
    renderWithIdeProviders(<AppShell />, { store });

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Compatibility notes')).toBeVisible();
    expect(store.getState().files.activeFileId).toBe('example:nibbles.asm');
    expect(store.getState().emulator.editorCode).toBe(nibblesSource);
  });

  it('propagates the overall app theme into the terminal surface', () => {
    mockSystemTheme('dark');

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'dark');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'dark');
    expect(screen.getByRole('button', { name: /open app menu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interpreter engine/i })).toHaveTextContent('Interpreter');
  });

  it('lets the app menu style selector switch the whole IDE theme', () => {
    mockSystemTheme('dark');

    render(<App />);

    openStyleMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k light/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'light');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'light');

    openStyleMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k dark/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
