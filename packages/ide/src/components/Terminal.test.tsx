import { createTerminalFrameBuffer, type Emulator } from '@m68k/interpreter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import Terminal from './Terminal';
import {
  getIdePerformanceSnapshot,
  resetIdePerformanceTelemetry,
} from '@/runtime/idePerformanceTelemetry';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore } from '@/stores/emulatorStore';
import {
  ideStore,
  requestFocusTerminal,
  resetSettingsState,
  setActiveFile,
  setEditorTheme,
  setTerminalInputMode,
} from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  window.dispatchEvent(new Event('resize'));
}

describe('Terminal', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));
    setViewportWidth(1280);
    resetIdePerformanceTelemetry();
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
        __M68K_IDE_TEST_PENDING_INPUT__?: unknown;
      }
    ).__M68K_IDE_PERF_ENABLED__ = false;
    (
      window as typeof window & {
        __M68K_IDE_TEST_PENDING_INPUT__?: unknown;
      }
    ).__M68K_IDE_TEST_PENDING_INPUT__ = undefined;
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
    expect(retroDisplay).toHaveAttribute('data-grid-mode', 'auto');
    expect(screen.getByTestId('terminal-screen')).toHaveAttribute('data-terminal-focused', 'false');
  }, 10000);

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

  it('records terminal repaint telemetry when the retro display writes a frame patch', async () => {
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
      }
    ).__M68K_IDE_PERF_ENABLED__ = true;

    const frameBuffer = createTerminalFrameBuffer(6, 1);
    frameBuffer.charBytes.set([
      'R'.charCodeAt(0),
      'E'.charCodeAt(0),
      'A'.charCodeAt(0),
      'D'.charCodeAt(0),
      'Y'.charCodeAt(0),
      ' '.charCodeAt(0),
    ]);
    frameBuffer.dirtyRowFlags[0] = 1;
    frameBuffer.version += 1;

    terminalSurfaceStore.publishFrame(frameBuffer, {
      columns: 6,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 5,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    });

    renderWithIdeProviders(<Terminal />);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('READY');
    });

    const snapshot = getIdePerformanceSnapshot();
    expect(snapshot.terminalRepaint.repaintCount).toBeGreaterThan(0);
    expect(snapshot.terminalRepaint.totalRowsPatched).toBeGreaterThan(0);
  });

  it('forces a full redraw when the terminal version changes without dirty rows', async () => {
    const frameBuffer = createTerminalFrameBuffer(6, 1);
    frameBuffer.charBytes.set([
      'I'.charCodeAt(0),
      'N'.charCodeAt(0),
      'T'.charCodeAt(0),
      'R'.charCodeAt(0),
      'O'.charCodeAt(0),
      ' '.charCodeAt(0),
    ]);
    frameBuffer.dirtyRowFlags[0] = 1;
    frameBuffer.version += 1;

    terminalSurfaceStore.publishFrame(frameBuffer, {
      columns: 6,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 5,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    });

    renderWithIdeProviders(<Terminal />);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('INTRO');
    });

    frameBuffer.charBytes.set([
      'P'.charCodeAt(0),
      'L'.charCodeAt(0),
      'A'.charCodeAt(0),
      'Y'.charCodeAt(0),
      ' '.charCodeAt(0),
      ' '.charCodeAt(0),
    ]);
    frameBuffer.version += 1;
    frameBuffer.dirtyRowFlags[0] = 0;

    terminalSurfaceStore.publishFrame(frameBuffer, {
      columns: 6,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 4,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    });

    await waitFor(() => {
      expect(screen.getByTestId('terminal-screen')).toHaveTextContent('PLAY');
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

  it('records an input-accepted telemetry event after a worker keyboard input is queued', async () => {
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
      }
    ).__M68K_IDE_PERF_ENABLED__ = true;
    const frameBuffer = createTerminalFrameBuffer(10, 2);
    const terminalMeta = {
      columns: 10,
      rows: 2,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const requestQueueInput = vi.fn(async () => undefined);

    useEmulatorStore.getState().setEmulatorInstance({
      controller: {
        requestQueueInput,
        requestResizeTerminal: vi.fn(async () => undefined),
      },
      getRuntimeTransport() {
        return 'worker' as const;
      },
      getTerminalFrameBuffer() {
        return frameBuffer;
      },
      getTerminalMeta() {
        return terminalMeta;
      },
    } as unknown as Emulator);

    renderWithIdeProviders(<Terminal />);

    fireEvent.keyDown(screen.getByTestId('terminal-screen'), { key: 'ArrowDown' });

    await waitFor(() => {
      expect(requestQueueInput).toHaveBeenCalledWith('s');
      expect(getIdePerformanceSnapshot().inputProgressAck.acceptedCount).toBeGreaterThan(0);
    });
  });

  it('dispatches a deferred perf-mode gameplay input once the HUD markers appear', async () => {
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
        __M68K_IDE_TEST_PENDING_INPUT__?: {
          dispatched?: boolean;
          hudMarkers: string[];
          inputs: Array<string | number>;
        };
      }
    ).__M68K_IDE_PERF_ENABLED__ = true;
    (
      window as typeof window & {
        __M68K_IDE_TEST_PENDING_INPUT__?: {
          dispatched?: boolean;
          hudMarkers: string[];
          inputs: Array<string | number>;
        };
      }
    ).__M68K_IDE_TEST_PENDING_INPUT__ = {
      dispatched: false,
      hudMarkers: ['SCORE:'],
      inputs: ['s'],
    };
    const frameBuffer = createTerminalFrameBuffer(10, 2);
    const terminalMeta = {
      columns: 10,
      rows: 2,
      cursorRow: 0,
      cursorColumn: 0,
      output: 'SCORE: 0',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const requestQueueInput = vi.fn(async () => undefined);

    useEmulatorStore.getState().setExecutionState({
      started: true,
      ended: false,
      stopped: false,
    });
    useEmulatorStore.getState().setEmulatorInstance({
      controller: {
        requestQueueInput,
        requestResizeTerminal: vi.fn(async () => undefined),
      },
      getRuntimeTransport() {
        return 'worker' as const;
      },
      getTerminalFrameBuffer() {
        return frameBuffer;
      },
      getTerminalMeta() {
        return terminalMeta;
      },
      getTerminalLines() {
        return ['SCORE: 0'];
      },
      getTerminalText() {
        return 'SCORE: 0';
      },
    } as unknown as Emulator);
    useEmulatorStore.getState().setTerminalSnapshot({
      columns: 10,
      rows: 2,
      cursorRow: 0,
      cursorColumn: 0,
      output: 'SCORE: 0',
      lines: ['SCORE: 0 ', '          '],
      cells: [
        Array.from('SCORE: 0 ').map((char) => ({
          char,
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        })),
        Array.from('          ').map((char) => ({
          char,
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        })),
      ],
    });

    renderWithIdeProviders(<Terminal />);

    await waitFor(() => {
      expect(requestQueueInput).toHaveBeenCalledWith('s');
      expect(getIdePerformanceSnapshot().inputProgressAck.acceptedCount).toBeGreaterThan(0);
      expect(
        (
          window as typeof window & {
            __M68K_IDE_TEST_PENDING_INPUT__?: {
              dispatched?: boolean;
            };
          }
        ).__M68K_IDE_TEST_PENDING_INPUT__?.dispatched
      ).toBe(true);
    });
  });

  it('disables keyboard capture while the terminal is in touch-only mode', () => {
    const queueInput = vi.fn();

    useEmulatorStore.getState().setEmulatorInstance({
      queueInput,
    } as unknown as Emulator);
    ideStore.dispatch(setTerminalInputMode('touch-only'));
    setViewportWidth(600);

    renderWithIdeProviders(<Terminal />);

    const terminalScreen = screen.getByTestId('terminal-screen');
    fireEvent.keyDown(terminalScreen, { key: 'ArrowUp' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(terminalScreen).toHaveAttribute('data-terminal-input-mode', 'touch-only');
    expect(screen.getByTestId('terminal-touch-overlay')).toBeInTheDocument();
    expect(queueInput).not.toHaveBeenCalled();
  });

  it('marks the terminal as a game screen when Nibbles is the active file', () => {
    ideStore.dispatch(setActiveFile('example:nibbles.asm'));

    renderWithIdeProviders(<Terminal />);

    expect(screen.getByTestId('terminal-screen')).toHaveAttribute('data-terminal-game-screen', 'true');
  });

  it('does not mark the terminal as a game screen for non-Nibbles files', () => {
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));

    renderWithIdeProviders(<Terminal />);

    expect(screen.getByTestId('terminal-screen')).toHaveAttribute('data-terminal-game-screen', 'false');
  });

  it('maps pointer presses to terminal cells and publishes touch mailbox bytes in touch-only mode', async () => {
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
      }
    ).__M68K_IDE_PERF_ENABLED__ = true;
    const frameBuffer = createTerminalFrameBuffer(10, 5);
    const terminalMeta = {
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const writeMemoryByte = vi.fn();
    const raiseExternalInterrupt = vi.fn(() => true);

    useEmulatorStore.getState().setTerminalSnapshot({
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: 'NIBBLES',
      lines: ['NIBBLES   ', '          ', '          ', '          ', '          '],
      cells: Array.from({ length: 5 }, (_, rowIndex) =>
        Array.from({ length: 10 }, (_, columnIndex) => ({
          char: rowIndex === 0 ? 'NIBBLES   '[columnIndex] ?? ' ' : ' ',
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        }))
      ),
    });
    useEmulatorStore.getState().setExecutionState({
      started: true,
      ended: false,
    });
    useEmulatorStore.getState().setEmulatorInstance({
      getSymbolAddress(symbol: string) {
        switch (symbol) {
          case 'TERM_COLS':
            return 0x2000;
          case 'TERM_ROWS':
            return 0x2001;
          case 'LAYOUT_PROFILE':
            return 0x2002;
          case 'TOUCH_PENDING':
            return 0x2010;
          case 'TOUCH_PHASE':
            return 0x2011;
          case 'TOUCH_ROW':
            return 0x2012;
          case 'TOUCH_COL':
            return 0x2013;
          case 'TOUCH_FLAGS':
            return 0x2014;
          case 'TOUCH_ISR':
            return 0x3000;
          default:
            return undefined;
        }
      },
      getTerminalFrameBuffer() {
        return frameBuffer;
      },
      getTerminalMeta() {
        return terminalMeta;
      },
      raiseExternalInterrupt,
      writeMemoryByte,
    } as unknown as Emulator);

    ideStore.dispatch(setTerminalInputMode('touch-only'));
    setViewportWidth(600);
    renderWithIdeProviders(<Terminal />);

    const gridElement = document.querySelector('.retro-lcd__grid') as HTMLElement | null;
    expect(gridElement).not.toBeNull();
    vi.spyOn(gridElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerDown(screen.getByTestId('terminal-touch-overlay'), {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2010, 1);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2011, 1);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2012, 14);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2013, 37);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2014, 0x12);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2000, 80);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2001, 25);
      expect(writeMemoryByte).toHaveBeenCalledWith(0x2002, 0);
    });
    expect(raiseExternalInterrupt).toHaveBeenCalledWith(0x3000);

    const snapshot = getIdePerformanceSnapshot();
    expect(snapshot.touchLatency.dispatchCount).toBe(1);
    expect(snapshot.touchLatency.lastDispatchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('requests a full resume after a successful worker touch dispatch from a waiting state', async () => {
    const frameBuffer = createTerminalFrameBuffer(10, 5);
    const terminalMeta = {
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const requestDispatchTouchPacket = vi.fn(async () => true);

    useEmulatorStore.getState().setTerminalSnapshot({
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: 'NIBBLES',
      lines: ['NIBBLES   ', '          ', '          ', '          ', '          '],
      cells: Array.from({ length: 5 }, (_, rowIndex) =>
        Array.from({ length: 10 }, (_, columnIndex) => ({
          char: rowIndex === 0 ? 'NIBBLES   '[columnIndex] ?? ' ' : ' ',
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        }))
      ),
    });
    useEmulatorStore.getState().setExecutionState({
      started: false,
      ended: false,
      stopped: true,
    });
    useEmulatorStore.getState().setEmulatorInstance({
      controller: {
        requestDispatchTouchPacket,
        requestResizeTerminal: vi.fn(async () => undefined),
      },
      getRuntimeTransport() {
        return 'worker';
      },
      getSymbolAddress(symbol: string) {
        switch (symbol) {
          case 'TOUCH_PENDING':
            return 0x2010;
          case 'TOUCH_PHASE':
            return 0x2011;
          case 'TOUCH_ROW':
            return 0x2012;
          case 'TOUCH_COL':
            return 0x2013;
          case 'TOUCH_FLAGS':
            return 0x2014;
          case 'TOUCH_ISR':
            return 0x3000;
          default:
            return undefined;
        }
      },
      getTerminalFrameBuffer() {
        return frameBuffer;
      },
      getTerminalMeta() {
        return terminalMeta;
      },
      isWaitingForInput() {
        return true;
      },
    } as unknown as Emulator);

    ideStore.dispatch(setTerminalInputMode('touch-only'));
    setViewportWidth(600);
    renderWithIdeProviders(<Terminal />);

    const gridElement = document.querySelector('.retro-lcd__grid') as HTMLElement | null;
    expect(gridElement).not.toBeNull();
    vi.spyOn(gridElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerDown(screen.getByTestId('terminal-touch-overlay'), {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(requestDispatchTouchPacket).toHaveBeenCalledTimes(1);
    });

    expect(ideStore.getState().emulator.runtimeIntents.resume).toBeGreaterThan(0);
  });

  it('treats a long press as a single touch until the pointer is released', async () => {
    const frameBuffer = createTerminalFrameBuffer(10, 5);
    const terminalMeta = {
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const requestDispatchTouchPacket = vi.fn(async () => true);

    useEmulatorStore.getState().setTerminalSnapshot({
      columns: 10,
      rows: 5,
      cursorRow: 0,
      cursorColumn: 0,
      output: 'NIBBLES',
      lines: ['NIBBLES   ', '          ', '          ', '          ', '          '],
      cells: Array.from({ length: 5 }, (_, rowIndex) =>
        Array.from({ length: 10 }, (_, columnIndex) => ({
          char: rowIndex === 0 ? 'NIBBLES   '[columnIndex] ?? ' ' : ' ',
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        }))
      ),
    });
    useEmulatorStore.getState().setExecutionState({
      started: true,
      ended: false,
      stopped: false,
    });
    useEmulatorStore.getState().setEmulatorInstance({
      controller: {
        requestDispatchTouchPacket,
        requestResizeTerminal: vi.fn(async () => undefined),
      },
      getRuntimeTransport() {
        return 'worker';
      },
      getSymbolAddress(symbol: string) {
        switch (symbol) {
          case 'TOUCH_PENDING':
            return 0x2010;
          case 'TOUCH_PHASE':
            return 0x2011;
          case 'TOUCH_ROW':
            return 0x2012;
          case 'TOUCH_COL':
            return 0x2013;
          case 'TOUCH_FLAGS':
            return 0x2014;
          case 'TOUCH_ISR':
            return 0x3000;
          default:
            return undefined;
        }
      },
      getTerminalFrameBuffer() {
        return frameBuffer;
      },
      getTerminalMeta() {
        return terminalMeta;
      },
    } as unknown as Emulator);

    ideStore.dispatch(setTerminalInputMode('touch-only'));
    setViewportWidth(600);
    renderWithIdeProviders(<Terminal />);

    const gridElement = document.querySelector('.retro-lcd__grid') as HTMLElement | null;
    expect(gridElement).not.toBeNull();
    vi.spyOn(gridElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    } as DOMRect);

    const overlay = screen.getByTestId('terminal-touch-overlay');

    fireEvent.pointerDown(overlay, {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(requestDispatchTouchPacket).toHaveBeenCalledTimes(1);
    });

    fireEvent.pointerMove(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });
    fireEvent.pointerDown(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 2,
      pointerType: 'touch',
      buttons: 1,
    });

    expect(requestDispatchTouchPacket).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(overlay, {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 0,
    });
    fireEvent.pointerDown(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 2,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(requestDispatchTouchPacket).toHaveBeenCalledTimes(2);
    });
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
    expect(
      screen.queryByRole('button', { name: /toggle terminal light mode/i })
    ).not.toBeInTheDocument();
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
