import { createTerminalFrameBuffer, type Emulator } from '@m68k/interpreter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import Terminal from './Terminal';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, requestFocusTerminal, resetSettingsState, setEditorTheme } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Terminal', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
  });

  it('renders the terminal snapshot through the retro display as a full-height surface', async () => {
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
    });

    const terminalContainer = document.querySelector('.terminal-container') as HTMLElement | null;
    const retroDisplay = document.querySelector('.retro-lcd') as HTMLElement | null;
    expect(terminalContainer).not.toBeNull();
    expect(screen.queryByText(/Display \d+x\d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /focus terminal/i })).not.toBeInTheDocument();
    expect(retroDisplay).not.toBeNull();
    expect(retroDisplay).toHaveAttribute('data-grid-mode', 'static');
    expect(screen.getByTestId('terminal-screen')).toHaveAttribute('data-terminal-focused', 'false');
  });

  it('renders from the terminal buffer even when no append output stream is present', async () => {
    const frameBuffer = createTerminalFrameBuffer(6, 1);
    frameBuffer.charBytes.set([
      'G'.charCodeAt(0),
      'A'.charCodeAt(0),
      'M'.charCodeAt(0),
      'E'.charCodeAt(0),
      ' '.charCodeAt(0),
      ' '.charCodeAt(0),
    ]);
    frameBuffer.dirtyRowFlags[0] = 1;
    frameBuffer.version += 1;

    terminalSurfaceStore.publishFrame(frameBuffer, {
      columns: 6,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 4,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    });

    renderWithIdeProviders(<Terminal />);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('GAME');
    });
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

  it('forwards page-level keyboard input into the emulator queue when the page is active', () => {
    const queueInput = vi.fn();
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    useEmulatorStore.getState().setEmulatorInstance({
      queueInput,
    } as unknown as Emulator);

    renderWithIdeProviders(<Terminal />);

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(queueInput).toHaveBeenNthCalledWith(1, 'a');
    expect(queueInput).toHaveBeenNthCalledWith(2, 0x0d);

    hasFocusSpy.mockRestore();
  });

  it('does not steal input from editable elements on the page', () => {
    const queueInput = vi.fn();

    useEmulatorStore.getState().setEmulatorInstance({
      queueInput,
    } as unknown as Emulator);

    renderWithIdeProviders(
      <div>
        <input aria-label="Notes" />
        <Terminal />
      </div>
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: /notes/i }), { key: 'd' });

    expect(queueInput).not.toHaveBeenCalled();
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

  it('focuses the retro display viewport and enables the terminal glow state when the focus event is dispatched', async () => {
    ideStore.dispatch(setEditorTheme(EditorThemeEnum.M68K_DARK));

    renderWithIdeProviders(<Terminal />);

    const viewport = document.querySelector('.retro-lcd__viewport') as HTMLDivElement | null;
    const terminalScreen = screen.getByTestId('terminal-screen');
    expect(viewport).not.toBeNull();
    expect(viewport).not.toHaveFocus();
    expect(terminalScreen).toHaveAttribute('data-terminal-focused', 'false');

    await act(async () => {
      ideStore.dispatch(requestFocusTerminal());
    });

    await waitFor(() => {
      expect(viewport).toHaveFocus();
      expect(terminalScreen).toHaveAttribute('data-terminal-focused', 'true');
    });
  });
});
