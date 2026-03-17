import type { Emulator } from '@m68k/interpreter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import Terminal from './Terminal';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetSettingsState, setEditorTheme } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Terminal', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
  });

  it('renders the terminal snapshot through the retro display and reports auto-fit geometry', async () => {
    useEmulatorStore.getState().setTerminalSnapshot({
      columns: 10,
      rows: 2,
      cursorRow: 1,
      cursorColumn: 3,
      output: 'Difficulty\r\nPlay',
      lines: ['Difficulty', 'Play      '],
      cells: [
        Array.from('Difficulty').map((char) => ({
          char,
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        })),
        Array.from('Play      ').map((char) => ({
          char,
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        })),
      ],
    });

    ideStore.dispatch(setEditorTheme(EditorThemeEnum.M68K_LIGHT));

    renderWithIdeProviders(<Terminal />);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('Difficulty');
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('Play');
      expect(screen.getByText(/Display \d+x\d+/)).toBeInTheDocument();
    });

    const retroDisplay = document.querySelector('.retro-lcd') as HTMLElement | null;
    expect(retroDisplay).not.toBeNull();
    expect(retroDisplay).toHaveAttribute('data-grid-mode', 'auto');
  });

  it('forwards terminal keyboard input into the emulator queue', () => {
    const queueInput = vi.fn();

    useEmulatorStore.getState().setEmulatorInstance({
      queueInput,
    } as unknown as Emulator);

    ideStore.dispatch(setEditorTheme(EditorThemeEnum.M68K_LIGHT));

    renderWithIdeProviders(<Terminal />);

    const terminalScreen = screen.getByTestId('terminal-screen');
    fireEvent.keyDown(terminalScreen, { key: 'ArrowUp' });
    fireEvent.keyDown(terminalScreen, { key: 'Enter' });
    fireEvent.keyDown(terminalScreen, { key: 'd' });

    expect(queueInput).toHaveBeenNthCalledWith(1, 'w');
    expect(queueInput).toHaveBeenNthCalledWith(2, 0x0d);
    expect(queueInput).toHaveBeenNthCalledWith(3, 'd');
  });

  it('syncs the retro display surface mode with the provided app theme', () => {
    ideStore.dispatch(setEditorTheme(EditorThemeEnum.M68K_LIGHT));

    renderWithIdeProviders(<Terminal />);

    const terminalContainer = document.querySelector('.terminal-container') as HTMLElement | null;
    const retroDisplay = document.querySelector('.retro-lcd') as HTMLElement | null;
    expect(terminalContainer).not.toBeNull();
    expect(terminalContainer).toHaveAttribute('data-terminal-theme', 'light');
    expect(retroDisplay).not.toBeNull();
    expect(retroDisplay).toHaveAttribute('data-display-surface-mode', 'light');
    expect(screen.queryByRole('button', { name: /toggle terminal light mode/i })).not.toBeInTheDocument();
  });

  it('focuses the retro display viewport when the focus event is dispatched', () => {
    ideStore.dispatch(setEditorTheme(EditorThemeEnum.M68K_DARK));

    renderWithIdeProviders(<Terminal />);

    const viewport = document.querySelector('.retro-lcd__viewport') as HTMLDivElement | null;
    expect(viewport).not.toBeNull();
    expect(viewport).not.toHaveFocus();

    window.dispatchEvent(new CustomEvent('emulator:focus-terminal'));

    expect(viewport).toHaveFocus();
  });
});
