import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '@m68k/ide';
import { Emulator } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetFilesState, resetSettingsState } from '@/store';

const NIBBLES_BOOT_TEST_TIMEOUT_MS = 60_000;
const NIBBLES_RESET_TEST_TIMEOUT_MS = 90_000;

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

describe('workspace integration', () => {
  const getWindowEmulator = (): IdeRuntimeSession => {
    const emulator = (window as typeof window & { emulatorInstance: IdeRuntimeSession | null })
      .emulatorInstance;
    expect(emulator).not.toBeNull();
    return emulator as IdeRuntimeSession;
  };

  const getEmulatorTerminalText = (): string => getWindowEmulator().getTerminalText();

  beforeEach(() => {
    terminalSurfaceStore.reset();
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetFilesState());
    ideStore.dispatch(resetSettingsState());
    useEmulatorStore.getState().setSpeedMultiplier(64);
    window.editorCode = '';
    window.emulatorInstance = null;
  });

  it('renders the ide and can instantiate the interpreter through workspace packages', async () => {
    const emulator = new Emulator('ORG $1000\nEND');

    expect(emulator.getException()).toBeUndefined();

    render(<App />);

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Last Instruction')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-screen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('assembly-editor')).toBeInTheDocument();

    useEmulatorStore.getState().setEditorCode(`START
  MOVE.B #'H',D0
  TRAP #15
  DC.W 1
  TRAP #11
  DC.W 0
  END START`);
    window.editorCode = useEmulatorStore.getState().editorCode;

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('H');
    });
  });

  it('can switch to Interpreter Redux and boot a simple program through the shared IDE flow', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));
    fireEvent.click(screen.getByRole('option', { name: /interpreter redux/i }));

    useEmulatorStore.getState().setEditorCode(`VALUE DC.L 0
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  MOVE.L D0,VALUE
  END START`);
    window.editorCode = useEmulatorStore.getState().editorCode;

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(() => {
      expect(ideStore.getState().settings.engineMode).toBe('interpreter-redux');
      expect(useEmulatorStore.getState().registers.d0).toBe(2);
    });

    const valueAddress = getWindowEmulator().getSymbolAddress('VALUE') ?? -1;
    expect(valueAddress).toBeGreaterThanOrEqual(0);
    expect(getWindowEmulator().getMemory()[valueAddress + 3]).toBe(2);
  });

  it('loads Nibbles from the file explorer, renders the splash screen, and forwards gameplay input', async () => {
    render(<App />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));
    expect(window.editorCode).toContain('END NIBBLES');

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('Difficulty');
        expect(getEmulatorTerminalText()).toContain('Programmed By Josh Henn');
        expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'light');
        expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'light');
      },
      { timeout: 30000 }
    );

    await waitFor(
      () => {
        expect(getWindowEmulator().isWaitingForInput()).toBe(true);
      },
      { timeout: 7000 }
    );

    fireEvent.keyDown(window, { key: 's' });

    await waitFor(
      () => {
        const emulator = getWindowEmulator();
        const difficultyAddress = emulator.getSymbolAddress('DIFFICULTY') ?? -1;
        expect(difficultyAddress).toBeGreaterThanOrEqual(0);
        expect(emulator.getMemory()[difficultyAddress]).toBe(1);
      },
      { timeout: 7000 }
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('SCORE:');
        expect(getEmulatorTerminalText()).toContain('LIVES:');
        expect(getEmulatorTerminalText()).toContain('LEVEL:');
      },
      { timeout: 30000 }
    );

    fireEvent.keyDown(window, { key: 'd' });

    await waitFor(
      () => {
        const emulator = getWindowEmulator();
        const directionAddress = emulator.getSymbolAddress('DIRECTION') ?? -1;
        const movingAddress = emulator.getSymbolAddress('MOVING') ?? -1;

        expect(directionAddress).toBeGreaterThanOrEqual(0);
        expect(movingAddress).toBeGreaterThanOrEqual(0);
        expect(emulator.getMemory()[movingAddress]).toBe(1);
        expect(emulator.getMemory()[directionAddress]).toBe(1);
      },
      { timeout: 7000 }
    );
  }, NIBBLES_BOOT_TEST_TIMEOUT_MS);

  it('can reset and relaunch Nibbles from a clean state', async () => {
    render(<App />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('Difficulty');
      },
      { timeout: 30000 }
    );

    await waitFor(
      () => {
        expect(getWindowEmulator().isWaitingForInput()).toBe(true);
      },
      { timeout: 7000 }
    );

    fireEvent.click(screen.getByTitle(/reset/i));

    await waitFor(() => {
      expect(window.emulatorInstance).toBeNull();
      expect(screen.getByText('Last Instruction').closest('.last-instruction')).toHaveTextContent('Ready');
      expect(terminalSurfaceStore.getText().trim()).toBe('');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('Difficulty');
        expect(getEmulatorTerminalText()).toContain('Programmed By Josh Henn');
      },
      { timeout: 30000 }
    );
  }, NIBBLES_RESET_TEST_TIMEOUT_MS);
});
