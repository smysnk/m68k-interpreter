import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '@m68k/ide';
import { Emulator } from '@m68k/interpreter';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetSettingsState } from '@/store';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

describe('workspace integration', () => {
  const getWindowEmulator = (): Emulator => {
    const emulator = (window as typeof window & { emulatorInstance: Emulator | null }).emulatorInstance;
    expect(emulator).not.toBeNull();
    return emulator as Emulator;
  };

  const getEmulatorTerminalText = (): string => getWindowEmulator().getTerminalSnapshot().lines.join('\n');

  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
    useEmulatorStore.getState().setSpeedMultiplier(64);
    window.editorCode = '';
    window.emulatorInstance = null;
  });

  it('renders the ide and can instantiate the interpreter through workspace packages', async () => {
    const emulator = new Emulator('ORG $1000\nEND');

    expect(emulator.getException()).toBeUndefined();

    render(<App />);

    expect(screen.getByText('Assembly Editor')).toBeInTheDocument();
    expect(screen.getByText('Last Instruction')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();

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
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('H');
    });
  });

  it('loads Nibbles in the ide, renders the splash screen, and forwards gameplay input', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /load nibbles/i }));
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

    const terminalScreen = screen.getByTestId('terminal-screen');

    fireEvent.keyDown(terminalScreen, { key: 's' });

    await waitFor(
      () => {
        const emulator = getWindowEmulator();
        const difficultyAddress = emulator.getSymbolAddress('DIFFICULTY') ?? -1;
        expect(difficultyAddress).toBeGreaterThanOrEqual(0);
        expect(emulator.getMemory()[difficultyAddress]).toBe(1);
      },
      { timeout: 7000 }
    );

    fireEvent.keyDown(terminalScreen, { key: 'Enter' });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('SCORE:');
        expect(getEmulatorTerminalText()).toContain('LIVES:');
        expect(getEmulatorTerminalText()).toContain('LEVEL:');
      },
      { timeout: 30000 }
    );

    fireEvent.keyDown(terminalScreen, { key: 'd' });

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
  }, 45000);

  it('can reset and relaunch Nibbles from a clean state', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /load nibbles/i }));

    act(() => {
      window.dispatchEvent(new CustomEvent('emulator:run'));
    });

    await waitFor(
      () => {
        expect(getEmulatorTerminalText()).toContain('Difficulty');
      },
      { timeout: 30000 }
    );

    fireEvent.click(screen.getByTitle(/reset/i));

    await waitFor(() => {
      expect(window.emulatorInstance).toBeNull();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(document.querySelector('.retro-lcd__body')?.textContent?.trim() ?? '').toBe('');
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
  }, 60000);
});
