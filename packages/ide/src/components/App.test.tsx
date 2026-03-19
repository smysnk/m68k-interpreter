import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { nibblesSource } from '@/programs/nibbles';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetSettingsState, setEngineMode } from '@/store';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

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
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
    useEmulatorStore.getState().setEditorCode(`ORG $1000
  * Write your M68K assembly code here
  * Your code goes here
END`);
    window.editorCode = '';
    window.emulatorInstance = null;
  });

  it('loads the Nibbles source into the editor', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));
    fireEvent.click(screen.getByRole('button', { name: /load nibbles/i }));

    expect(useEmulatorStore.getState().editorCode).toBe(nibblesSource);
    expect(window.editorCode).toContain('END NIBBLES');
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

  it('forces the default Interpreter engine when loading Nibbles', () => {
    ideStore.dispatch(setEngineMode('interpreter-redux'));

    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));
    fireEvent.click(screen.getByRole('button', { name: /load nibbles/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter');
    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('stores the selected interpreter engine in Redux and resets the active runtime', () => {
    render(<App />);

    useEmulatorStore.getState().setEmulatorInstance({
      emulationStep: vi.fn(),
      getCFlag: vi.fn(() => 0),
      getErrors: vi.fn(() => []),
      getException: vi.fn(() => undefined),
      getLastInstruction: vi.fn(() => 'Ready'),
      getMemory: vi.fn(() => ({})),
      getNFlag: vi.fn(() => 0),
      getPC: vi.fn(() => 0),
      getQueuedInputLength: vi.fn(() => 0),
      getRegisters: vi.fn(() => new Int32Array(16)),
      getSymbolAddress: vi.fn(() => undefined),
      getSymbols: vi.fn(() => ({})),
      getTerminalSnapshot: vi.fn(() => useEmulatorStore.getState().terminalSnapshot),
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

    fireEvent.change(screen.getByLabelText(/interpreter engine/i), {
      target: { value: 'interpreter-redux' },
    });

    expect(ideStore.getState().settings.engineMode).toBe('interpreter-redux');
    expect(useEmulatorStore.getState().emulatorInstance).toBeNull();
    expect(window.emulatorInstance).toBeNull();
  });

  it('toggles the compatibility notes panel', () => {
    render(<App />);

    expect(screen.queryByLabelText('Compatibility notes')).not.toBeVisible();

    fireEvent.click(screen.getByTitle(/compatibility notes/i));
    expect(screen.getByLabelText('Compatibility notes')).toBeVisible();

    fireEvent.click(screen.getByTitle(/compatibility notes/i));
    expect(screen.queryByLabelText('Compatibility notes')).not.toBeVisible();
  });

  it('propagates the overall app theme into the terminal surface', () => {
    mockSystemTheme('dark');

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'dark');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'dark');
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/interpreter engine/i)).toHaveDisplayValue('Interpreter');
  });

  it('lets the navbar theme toggle switch the whole IDE theme', () => {
    mockSystemTheme('dark');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'light');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'light');
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });
});
