import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '@m68k/ide';
import { Emulator } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore } from '@/stores/emulatorStore';
import {
  ideStore,
  requestReset,
  requestRun,
  resetFilesState,
  resetSettingsState,
  setActiveFileContent,
} from '@/store';

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
    expect(screen.getByTestId('terminal-screen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('assembly-editor')).toBeInTheDocument();

    act(() => {
      ideStore.dispatch(
        setActiveFileContent(`START
  MOVE.B #'H',D0
  TRAP #15
  DC.W 1
  TRAP #11
  DC.W 0
  END START`)
      );
    });

    act(() => {
      ideStore.dispatch(requestRun());
    });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
      expect(window.emulatorInstance).not.toBeNull();
      expect(getEmulatorTerminalText()).toContain('H');
      expect(terminalSurfaceStore.getText()).toContain('H');
    });
  });

  it('loads Nibbles from the file explorer, renders the splash screen, and forwards gameplay input', async () => {
    render(<App />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));
    expect(window.editorCode).toContain('END NIBBLES');

    act(() => {
      ideStore.dispatch(requestRun());
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('SELECT DIFFICULTY');
        expect(getEmulatorTerminalText()).toContain('Joshua Bellamy');
        expect(getEmulatorTerminalText()).toContain('smysnk.com');
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
      ideStore.dispatch(requestRun());
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('SELECT DIFFICULTY');
      },
      { timeout: 30000 }
    );

    await waitFor(
      () => {
        expect(getWindowEmulator().isWaitingForInput()).toBe(true);
      },
      { timeout: 7000 }
    );

    act(() => {
      ideStore.dispatch(requestReset());
    });

    await waitFor(() => {
      expect(window.emulatorInstance).toBeNull();
      expect(useEmulatorStore.getState().executionState.lastInstruction).toBe('Ready');
      expect(terminalSurfaceStore.getText().trim()).toBe('');
    });

    act(() => {
      ideStore.dispatch(requestRun());
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('SELECT DIFFICULTY');
        expect(getEmulatorTerminalText()).toContain('Joshua Bellamy');
        expect(getEmulatorTerminalText()).toContain('smysnk.com');
      },
      { timeout: 30000 }
    );
  }, NIBBLES_RESET_TEST_TIMEOUT_MS);
});
