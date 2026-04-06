import type { Page } from '@playwright/test';

export interface NibblesRuntimeState {
  waitingForInput: boolean | null;
  halted: boolean | null;
  text: string | null;
  columns: number | null;
  rows: number | null;
  layoutProfile: number | null;
  viewportCols: number | null;
  viewportRows: number | null;
  viewportOriginX: number | null;
  viewportOriginY: number | null;
  direction: number | null;
  lastDirection: number | null;
  moving: number | null;
  posX: number | null;
  posY: number | null;
}

export interface TerminalSnapshotCell {
  char: string;
  foreground: number | null;
  background: number | null;
  bold: boolean;
  inverse: boolean;
}

export interface TerminalBrowserSnapshot {
  columns: number;
  rows: number;
  lines: string[];
  cells: TerminalSnapshotCell[][];
  cursorVisible: boolean;
}

export interface NibblesRuntimeMotionState {
  waitingForInput: boolean | null;
  direction: number | null;
  lastDirection: number | null;
  moving: number | null;
  posX: number | null;
  posY: number | null;
}

interface NibblesRuntimeSurfaceState {
  waitingForInput: boolean | null;
  halted: boolean | null;
  text: string | null;
  columns: number | null;
  rows: number | null;
}

interface IdePerformanceSnapshot {
  workerTransport: {
    frameEventsReceived: number;
  };
  terminalRepaint: {
    repaintCount: number;
  };
  touchLatency: {
    dispatchCount: number;
    visualLatencyCount: number;
  };
}

interface InputProgressAckPayload {
  ackCount: number;
  latencyMs: number;
  repaintCount: number;
  frameEventsReceived: number;
  touchDispatchCount: number;
  touchVisualCount: number;
}

interface InputAcceptedPayload {
  acceptedCount: number;
  requestCount: number;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withNodeTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function parseInputProgressAck(text: string): InputProgressAckPayload | null {
  const prefix = '__M68K_INPUT_PROGRESS_ACK__';
  if (!text.startsWith(prefix)) {
    return null;
  }

  try {
    return JSON.parse(text.slice(prefix.length)) as InputProgressAckPayload;
  } catch {
    return null;
  }
}

function parseInputAccepted(text: string): InputAcceptedPayload | null {
  const prefix = '__M68K_INPUT_ACCEPTED__';
  if (!text.startsWith(prefix)) {
    return null;
  }

  try {
    return JSON.parse(text.slice(prefix.length)) as InputAcceptedPayload;
  } catch {
    return null;
  }
}

async function focusTerminalViewport(page: Page): Promise<void> {
  const viewport = page.locator('[data-testid="terminal-screen"] .retro-lcd__viewport').first();
  await viewport.waitFor({ state: 'visible', timeout: 30_000 });
  await viewport.focus();
}

function mapKeyToAssemblerInput(key: string): string | number | null {
  switch (key) {
    case 'ArrowUp':
      return 'w';
    case 'ArrowDown':
      return 's';
    case 'ArrowLeft':
      return 'a';
    case 'ArrowRight':
      return 'd';
    case 'Enter':
      return 0x0d;
    default:
      break;
  }

  if (key.length === 1) {
    return key.toLowerCase();
  }

  return null;
}

export async function pressTerminalKey(page: Page, key: string): Promise<void> {
  await focusTerminalViewport(page);
  await page.keyboard.press(key);
}

async function queueRuntimeInputSequence(page: Page, keys: string[]): Promise<void> {
  const inputs = keys
    .map((key) => mapKeyToAssemblerInput(key))
    .filter((value): value is string | number => value !== null);

  await page.evaluate(async (queuedInputs) => {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const controller = runtime?.controller;
    const telemetry = (window as typeof window & {
      __M68K_IDE_PERF__?: {
        markInputAccepted?: () => void;
        markInputRequest?: (metric?: { startedAtMs?: number }) => void;
      };
    }).__M68K_IDE_PERF__;
    if (!controller) {
      return;
    }

    telemetry?.markInputRequest?.();
    for (const input of queuedInputs) {
      await controller.requestQueueInput(input);
    }
    telemetry?.markInputAccepted?.();

    const pulseAccepted = await controller.requestPulseExecution?.(2);
    if (pulseAccepted) {
      return;
    }

    await controller.requestResume?.();
    await controller.requestPulseExecution?.(2);
  }, inputs);
}

export async function dispatchAssemblerInput(page: Page, keys: string[]): Promise<void> {
  const inputs = keys
    .map((key) => mapKeyToAssemblerInput(key))
    .filter((value): value is string | number => value !== null);

  await page.evaluate(function (queuedInputs) {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const controller = runtime?.controller;

    if (controller) {
      for (const input of queuedInputs) {
        void controller.requestQueueInput(input);
      }

      void controller.requestPulseExecution?.(2);
      return;
    }

    if (typeof runtime?.queueInput === 'function') {
      for (const input of queuedInputs) {
        runtime.queueInput(input);
      }
    }
  }, inputs);
}

export async function scheduleDeferredGameplayInput(
  page: Page,
  keys: string[],
  hudMarkers: string[]
): Promise<void> {
  const inputs = keys
    .map((key) => mapKeyToAssemblerInput(key))
    .filter((value): value is string | number => value !== null);

  await page.evaluate(
    ({ queuedInputs, nextHudMarkers }) => {
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
        hudMarkers: nextHudMarkers,
        inputs: queuedInputs,
      };
    },
    {
      queuedInputs: inputs,
      nextHudMarkers: hudMarkers,
    }
  );
}

export async function pauseRuntimeExecution(page: Page): Promise<void> {
  await withNodeTimeout(
    page.evaluate(async () => {
      const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
      const controller = runtime?.controller;
      if (!controller?.requestPause) {
        return;
      }

      await controller.requestPause();
    }),
    2_000,
    'runtime pause dispatch'
  );

  await delay(50);
}

async function dispatchRuntimeTouchPacket(
  page: Page,
  options: { row: number; col: number; phase?: 1 | 2 | 3 }
): Promise<boolean> {
  return page.evaluate(async function ({ row, col, phase }) {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const controller = runtime?.controller;
    if (!controller) {
      return false;
    }

    const touchPending = runtime.getSymbolAddress?.('TOUCH_PENDING');
    const touchPhase = runtime.getSymbolAddress?.('TOUCH_PHASE');
    const touchRow = runtime.getSymbolAddress?.('TOUCH_ROW');
    const touchCol = runtime.getSymbolAddress?.('TOUCH_COL');
    const touchFlags = runtime.getSymbolAddress?.('TOUCH_FLAGS');
    const touchIsr = runtime.getSymbolAddress?.('TOUCH_ISR');

    if (
      typeof touchPending !== 'number' ||
      typeof touchPhase !== 'number' ||
      typeof touchRow !== 'number' ||
      typeof touchCol !== 'number' ||
      typeof touchFlags !== 'number' ||
      typeof touchIsr !== 'number'
    ) {
      return false;
    }

    const accepted = await controller.requestDispatchTouchPacket(
      {
        touchPending,
        touchPhase,
        touchRow,
        touchCol,
        touchFlags,
        touchIsr,
      },
      {
        pending: 1,
        phase: phase ?? 1,
        row,
        col,
        flags: 0x12,
      }
    );

    if (!accepted) {
      return false;
    }

    await controller.requestResume?.();
    await controller.requestPulseExecution?.(2);
    return true;
  }, options);
}

export async function dispatchRuntimeTouchDirection(
  page: Page,
  direction: 'up' | 'down' | 'left' | 'right'
): Promise<void> {
  const geometry = await page.evaluate(function () {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const meta = runtime?.getTerminalMeta?.() ?? null;
    return {
      rows: meta?.rows ?? 0,
      columns: meta?.columns ?? 0,
    };
  });

  const target = {
    left: {
      row: Math.max(2, Math.ceil(geometry.rows / 2)),
      col: 2,
    },
    right: {
      row: Math.max(2, Math.ceil(geometry.rows / 2)),
      col: Math.max(2, geometry.columns - 2),
    },
    up: {
      row: 2,
      col: Math.max(2, Math.ceil(geometry.columns / 2)),
    },
    down: {
      row: Math.max(2, geometry.rows - 1),
      col: Math.max(2, Math.ceil(geometry.columns / 2)),
    },
  }[direction];

  await page.evaluate(function ({ row, col }) {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const controller = runtime?.controller;
    if (!controller) {
      throw new Error('Missing worker controller for runtime touch direction dispatch');
    }

    const touchPending = runtime.getSymbolAddress?.('TOUCH_PENDING');
    const touchPhase = runtime.getSymbolAddress?.('TOUCH_PHASE');
    const touchRow = runtime.getSymbolAddress?.('TOUCH_ROW');
    const touchCol = runtime.getSymbolAddress?.('TOUCH_COL');
    const touchFlags = runtime.getSymbolAddress?.('TOUCH_FLAGS');
    const touchIsr = runtime.getSymbolAddress?.('TOUCH_ISR');

    if (
      typeof touchPending !== 'number' ||
      typeof touchPhase !== 'number' ||
      typeof touchRow !== 'number' ||
      typeof touchCol !== 'number' ||
      typeof touchFlags !== 'number' ||
      typeof touchIsr !== 'number'
    ) {
      throw new Error('Missing terminal touch protocol symbols for runtime touch direction dispatch');
    }

    void controller.requestDispatchTouchPacket(
      {
        touchPending,
        touchPhase,
        touchRow,
        touchCol,
        touchFlags,
        touchIsr,
      },
      {
        pending: 1,
        phase: 1,
        row,
        col,
        flags: 0x12,
      }
    );

    void controller.requestPulseExecution?.(2);
  }, target);
}

export async function loadNibbles(
  page: Page,
  options: {
    useFileExplorer?: boolean;
    speed?: string;
    navigate?: boolean;
  } = {}
): Promise<void> {
  if (options.navigate !== false) {
    await page.goto('/?ide_perf=1');
  }

  const terminalTab = page.getByRole('tab', { name: /terminal|term/i });
  const codeTab = page.getByRole('tab', { name: /code/i });
  const fileExplorerButton = page.getByRole('button', { name: /open file explorer/i });
  const runButton = page.getByRole('button', { name: /run program/i });
  const speedInput = page.getByLabel('Speed (x)');

  await terminalTab.waitFor({ state: 'visible', timeout: 30_000 });
  if (options.useFileExplorer) {
    await fileExplorerButton.waitFor({ state: 'visible', timeout: 30_000 });
    await fileExplorerButton.hover();
    await page.getByRole('button', { name: /nibbles\.asm/i }).click();
  } else if (await codeTab.isVisible().catch(() => false)) {
    await codeTab.click();
  }

  if (await speedInput.isVisible()) {
    await speedInput.fill(options.speed ?? '8');
  }

  await runButton.click();
  await page.getByTestId('terminal-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean((window as typeof window & { emulatorInstance?: unknown }).emulatorInstance),
    { timeout: 15_000 }
  );
}

export async function readTerminalText(page: Page): Promise<string> {
  return withNodeTimeout(
    page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('[data-testid="terminal-screen"]');
      if (!screen) {
        return '';
      }

      const lines = Array.from(screen.querySelectorAll<HTMLElement>('.retro-lcd__line'));
      if (lines.length > 0) {
        return lines.map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' ')).join('\n');
      }

      return (screen.textContent ?? '').replace(/\u00a0/g, ' ');
    }),
    4_000,
    'terminal text read'
  );
}

export async function waitForTerminalText(
  page: Page,
  markers: string[],
  timeoutMs: number
): Promise<string> {
  const startedAt = Date.now();
  let lastTerminalText = '';

  while (Date.now() - startedAt < timeoutMs) {
    const terminalText = await readTerminalText(page);
    lastTerminalText = terminalText;
    if (markers.every((marker) => terminalText.includes(marker))) {
      return terminalText;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for terminal markers: ${markers.join(', ')}\nLast terminal text:\n${lastTerminalText}`
  );
}

export async function readRuntimeState(page: Page): Promise<NibblesRuntimeState> {
  return page.evaluate(async function () {
    const workerRequestTimeoutMs = 500;
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    if (!runtime) {
      return {
        waitingForInput: null,
        halted: null,
        text: null,
        columns: null,
        rows: null,
        layoutProfile: null,
        viewportCols: null,
        viewportRows: null,
        viewportOriginX: null,
        viewportOriginY: null,
        direction: null,
        lastDirection: null,
        moving: null,
        posX: null,
        posY: null,
      };
    }

    const terminalMeta = runtime.getTerminalMeta?.() ?? null;
    const screenElement = document.querySelector<HTMLElement>('[data-testid="terminal-screen"]');
    const lines = Array.from(screenElement?.querySelectorAll('.retro-lcd__line') ?? []);
    const startIndex = Math.max(lines.length - Math.max(terminalMeta?.rows ?? 1, 1), 0);
    const renderedLines: string[] = [];
    for (let index = startIndex; index < lines.length; index += 1) {
      renderedLines.push((lines[index]?.textContent ?? '').replace(/\u00a0/g, ' '));
    }
    const text =
      renderedLines.length > 0
        ? renderedLines.join('\n')
        : runtime.getTerminalText?.() ??
          (screenElement?.textContent ?? null);
    const symbolValues: Record<string, number | null> = {};
    const symbolNames = [
      'LAYOUT_PROFILE',
      'VIEWPORT_COLS',
      'VIEWPORT_ROWS',
      'VIEWPORT_ORIGIN_X',
      'VIEWPORT_ORIGIN_Y',
      'DIRECTION',
      'LAST_DIR',
      'MOVING',
      'POS_X',
      'POS_Y',
    ];

    for (const symbol of symbolNames) {
      let address = runtime.getSymbolAddress?.(symbol);
      if (typeof address !== 'number' && typeof runtime.controller?.requestSymbolAddress === 'function') {
        try {
          const resolved = await Promise.race([
            runtime.controller.requestSymbolAddress(symbol),
            new Promise((resolve) => {
              window.setTimeout(() => resolve(null), workerRequestTimeoutMs);
            }),
          ]);
          address = typeof resolved === 'number' ? resolved : null;
        } catch {
          address = null;
        }
      }

      if (typeof address !== 'number') {
        symbolValues[symbol] = null;
        continue;
      }

      if (typeof runtime.controller?.requestReadMemoryRange === 'function') {
        try {
          const bytes = await Promise.race([
            runtime.controller.requestReadMemoryRange(address, 1),
            new Promise((resolve) => {
              window.setTimeout(() => resolve(null), workerRequestTimeoutMs);
            }),
          ]);
          symbolValues[symbol] = bytes?.[0] ?? null;
          continue;
        } catch {
          symbolValues[symbol] = null;
          continue;
        }
      }

      if (typeof runtime.readMemoryRange === 'function') {
        const bytes = runtime.readMemoryRange(address, 1);
        symbolValues[symbol] = bytes?.[0] ?? null;
        continue;
      }

      symbolValues[symbol] = null;
    }

    return {
      waitingForInput: runtime.isWaitingForInput?.() ?? null,
      halted: runtime.isHalted?.() ?? null,
      text,
      columns: terminalMeta?.columns ?? null,
      rows: terminalMeta?.rows ?? null,
      layoutProfile: symbolValues.LAYOUT_PROFILE ?? null,
      viewportCols: symbolValues.VIEWPORT_COLS ?? null,
      viewportRows: symbolValues.VIEWPORT_ROWS ?? null,
      viewportOriginX: symbolValues.VIEWPORT_ORIGIN_X ?? null,
      viewportOriginY: symbolValues.VIEWPORT_ORIGIN_Y ?? null,
      direction: symbolValues.DIRECTION ?? null,
      lastDirection: symbolValues.LAST_DIR ?? null,
      moving: symbolValues.MOVING ?? null,
      posX: symbolValues.POS_X ?? null,
      posY: symbolValues.POS_Y ?? null,
    };
  });
}

export async function readTerminalSnapshot(page: Page): Promise<TerminalBrowserSnapshot | null> {
  return page.evaluate(() => {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const snapshot = runtime?.getTerminalSnapshot?.() ?? null;
    if (!snapshot) {
      return null;
    }

    return {
      columns: snapshot.columns ?? 0,
      rows: snapshot.rows ?? 0,
      lines: Array.isArray(snapshot.lines) ? snapshot.lines.slice() : [],
      cursorVisible:
        document.querySelector('[data-testid="terminal-screen"] .retro-lcd__cursor') !== null,
      cells: Array.isArray(snapshot.cells)
        ? snapshot.cells.map((row: Array<any>) =>
            row.map((cell) => ({
              char: typeof cell?.char === 'string' ? cell.char : ' ',
              foreground:
                typeof cell?.foreground === 'number' ? cell.foreground : null,
              background:
                typeof cell?.background === 'number' ? cell.background : null,
              bold: cell?.bold === true,
              inverse: cell?.inverse === true,
            }))
          )
        : [],
    };
  });
}

export async function readRuntimeMotionState(page: Page): Promise<NibblesRuntimeMotionState> {
  return page.evaluate(async function () {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    if (!runtime) {
      return {
        waitingForInput: null,
        direction: null,
        lastDirection: null,
        moving: null,
        posX: null,
        posY: null,
      };
    }

    const controller = runtime.controller;
    const withTimeout = async function (promise: Promise<any>, fallback: any) {
      try {
        return await Promise.race([
          promise,
          new Promise((resolve) => window.setTimeout(() => resolve(fallback), 250)),
        ]);
      } catch {
        return fallback;
      }
    };

    const readSymbolByte = async function (symbol: string) {
      const address = runtime.getSymbolAddress?.(symbol);
      if (typeof address !== 'number') {
        return null;
      }

      if (typeof controller?.requestReadMemoryRange === 'function') {
        const bytes = await withTimeout(controller.requestReadMemoryRange(address, 1), null);
        return bytes?.[0] ?? null;
      }

      if (typeof runtime.readMemoryRange === 'function') {
        const bytes = runtime.readMemoryRange(address, 1);
        return bytes?.[0] ?? null;
      }

      return null;
    };

    const [direction, lastDirection, moving, posX, posY] = await Promise.all([
      readSymbolByte('DIRECTION'),
      readSymbolByte('LAST_DIR'),
      readSymbolByte('MOVING'),
      readSymbolByte('POS_X'),
      readSymbolByte('POS_Y'),
    ]);

    return {
      waitingForInput: runtime.isWaitingForInput?.() ?? null,
      direction,
      lastDirection,
      moving,
      posX,
      posY,
    };
  });
}

async function readRuntimeSurfaceState(page: Page): Promise<NibblesRuntimeSurfaceState> {
  return page.evaluate(() => {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const terminalMeta = runtime?.getTerminalMeta?.() ?? null;
    const screenElement = document.querySelector<HTMLElement>('[data-testid="terminal-screen"]');
    const lines = Array.from(screenElement?.querySelectorAll('.retro-lcd__line') ?? []);
    const startIndex = Math.max(lines.length - Math.max(terminalMeta?.rows ?? 1, 1), 0);
    const renderedLines: string[] = [];

    for (let index = startIndex; index < lines.length; index += 1) {
      renderedLines.push((lines[index]?.textContent ?? '').replace(/\u00a0/g, ' '));
    }

    return {
      waitingForInput: runtime?.isWaitingForInput?.() ?? null,
      halted: runtime?.isHalted?.() ?? null,
      text:
        renderedLines.length > 0
          ? renderedLines.join('\n')
          : runtime?.getTerminalText?.() ??
            (screenElement?.textContent ?? null),
      columns: terminalMeta?.columns ?? null,
      rows: terminalMeta?.rows ?? null,
    };
  });
}

export async function waitForIntro(
  page: Page,
  options: { expectTouchCopy: boolean; timeoutMs?: number }
): Promise<string> {
  const terminalText = await waitForTerminalText(
    page,
    ['NIBBLES', 'SELECT DIFFICULTY', 'EASY', 'INSANE'],
    options.timeoutMs ?? 60_000
  );

  if (options.expectTouchCopy) {
    if (!/Tap difficulty|Tap a row to start/.test(terminalText)) {
      throw new Error(`Expected touch-optimized intro copy. Current text:\n${terminalText}`);
    }
  }

  return terminalText;
}

export async function waitForGameplay(
  page: Page,
  options: { hudMarker: string | string[]; timeoutMs?: number }
): Promise<NibblesRuntimeState> {
  const startedAt = Date.now();
  let lastState: NibblesRuntimeSurfaceState | null = null;
  const hudMarkers = Array.isArray(options.hudMarker) ? options.hudMarker : [options.hudMarker];

  while (Date.now() - startedAt < (options.timeoutMs ?? 20_000)) {
    const state = await readRuntimeSurfaceState(page);
    lastState = state;
    if (
      state.waitingForInput === false &&
      typeof state.text === 'string' &&
      hudMarkers.some((marker) => state.text.includes(marker))
    ) {
      const detailedState = await Promise.race([
        readRuntimeState(page),
        new Promise<NibblesRuntimeState>((resolve) =>
          setTimeout(
            () =>
              resolve({
                waitingForInput: state.waitingForInput,
                halted: state.halted,
                text: state.text,
                columns: state.columns,
                rows: state.rows,
                layoutProfile: null,
                viewportCols: null,
                viewportRows: null,
                viewportOriginX: null,
                viewportOriginY: null,
                direction: null,
                lastDirection: null,
                moving: null,
                posX: null,
                posY: null,
              }),
            750
          )
        ),
      ]);
      return detailedState;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for gameplay with HUD marker "${hudMarkers.join(', ')}". Last state: ${JSON.stringify(
      lastState,
      null,
      2
    )}`
  );
}

export async function touchTerminalCell(page: Page, row: number, col: number): Promise<void> {
  await page.evaluate(
    ({ row, col }) => {
      const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
      const geometry = runtime?.getTerminalMeta?.() ?? null;
      if (!geometry) {
        throw new Error('Terminal runtime geometry was unavailable');
      }

      const screenElement = document.querySelector<HTMLElement>('[data-testid="terminal-screen"]');
      if (!screenElement) {
        throw new Error('Terminal screen was unavailable');
      }

      const overlay =
        screenElement.querySelector<HTMLElement>('[data-testid="terminal-touch-overlay"]') ??
        screenElement;
      const grid = screenElement.querySelector<HTMLElement>('.retro-lcd__grid');
      if (!grid) {
        throw new Error('Terminal grid was unavailable');
      }

      const rect = grid.getBoundingClientRect();
      const clientX = rect.left + ((col - 0.5) / geometry.columns) * rect.width;
      const clientY = rect.top + ((row - 0.5) / geometry.rows) * rect.height;
      const baseEvent = {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: 'touch',
      };

      overlay.dispatchEvent(new PointerEvent('pointerdown', { ...baseEvent, buttons: 1 }));
      overlay.dispatchEvent(new PointerEvent('pointerup', { ...baseEvent, buttons: 0 }));
    },
    { row, col }
  );
}

async function resolveTerminalInputMode(page: Page): Promise<'text-input' | 'touch-only' | null> {
  return page.evaluate(() => {
    const terminalScreen = document.querySelector<HTMLElement>('[data-testid="terminal-screen"]');
    const mode = terminalScreen?.getAttribute('data-terminal-input-mode');
    return mode === 'text-input' || mode === 'touch-only' ? mode : null;
  });
}

async function resolveDirectionalTouchCell(
  page: Page,
  direction: 'up' | 'down' | 'left' | 'right'
): Promise<{ row: number; col: number }> {
  return page.evaluate(function (nextDirection) {
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const geometry = runtime?.getTerminalMeta?.() ?? null;
    if (!geometry || geometry.columns <= 0 || geometry.rows <= 0) {
      throw new Error('Terminal runtime geometry was unavailable');
    }

    const quarterRow = Math.max(2, Math.ceil(geometry.rows * 0.25));
    const threeQuarterRow = Math.max(2, Math.ceil(geometry.rows * 0.75));
    const quarterCol = Math.max(2, Math.ceil(geometry.columns * 0.25));
    const threeQuarterCol = Math.max(2, Math.ceil(geometry.columns * 0.75));

    return {
      left: {
        row: Math.max(2, Math.ceil(geometry.rows / 2)),
        col: quarterCol,
      },
      right: {
        row: Math.max(2, Math.ceil(geometry.rows / 2)),
        col: threeQuarterCol,
      },
      up: {
        row: quarterRow,
        col: Math.max(2, Math.ceil(geometry.columns / 2)),
      },
      down: {
        row: threeQuarterRow,
        col: Math.max(2, Math.ceil(geometry.columns / 2)),
      },
    }[nextDirection];
  }, direction);
}

export async function touchTerminalRelativeDirection(
  page: Page,
  direction: 'up' | 'down' | 'left' | 'right',
  options: { dispatchStrategy?: 'dom' | 'runtime' | 'auto' } = {}
): Promise<void> {
  const dispatchStrategy = options.dispatchStrategy ?? 'auto';
  const targetCell = await resolveDirectionalTouchCell(page, direction);

  if (dispatchStrategy !== 'dom') {
    const inputMode = dispatchStrategy === 'runtime' ? 'text-input' : await resolveTerminalInputMode(page);
    const shouldUseRuntimeDispatch =
      dispatchStrategy === 'runtime' || inputMode !== 'touch-only';

    if (shouldUseRuntimeDispatch) {
      const dispatched = await dispatchRuntimeTouchPacket(page, {
        row: targetCell.row,
        col: targetCell.col,
      });
      if (dispatched) {
        return;
      }
    }
  }

  await touchTerminalCell(page, targetCell.row, targetCell.col);
}

export async function startGameplayFromIntroTouch(
  page: Page,
  options: {
    row: number;
    col: number;
    hudMarker: string;
    maxAttempts?: number;
    gameplayTimeoutMs?: number;
    dispatchStrategy?: 'dom' | 'runtime' | 'auto';
  }
): Promise<NibblesRuntimeState> {
  let lastError: unknown = null;
  const dispatchStrategy = options.dispatchStrategy ?? 'auto';

  for (let attempt = 0; attempt < (options.maxAttempts ?? 3); attempt += 1) {
    let dispatched = false;
    if (dispatchStrategy !== 'dom') {
      dispatched = await dispatchRuntimeTouchPacket(page, {
        row: options.row,
        col: options.col,
      });
    }
    if (!dispatched && dispatchStrategy !== 'runtime') {
      await touchTerminalCell(page, options.row, options.col);
    }

    try {
      return await waitForGameplay(page, {
        hudMarker: options.hudMarker,
        timeoutMs: options.gameplayTimeoutMs ?? 6_000,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to leave the intro after ${options.maxAttempts ?? 3} touch attempts`);
}

export async function startGameplayFromIntroKeyboard(
  page: Page,
  options: {
    keys: string[];
    hudMarker: string | string[];
    gameplayTimeoutMs?: number;
  }
): Promise<NibblesRuntimeState> {
  const startedAt = Date.now();
  await focusTerminalViewport(page);
  for (const key of options.keys) {
    await page.locator('[data-testid="terminal-screen"] .retro-lcd__viewport').first().press(key);
    await delay(50);
  }

  const gameplayTimeoutMs = options.gameplayTimeoutMs ?? 10_000;
  const primaryKeyboardTimeoutMs = Math.min(4_000, gameplayTimeoutMs);

  try {
    return await waitForGameplay(page, {
      hudMarker: options.hudMarker,
      timeoutMs: primaryKeyboardTimeoutMs,
    });
  } catch {
    await queueRuntimeInputSequence(page, options.keys);
    const remainingTimeoutMs = Math.max(gameplayTimeoutMs - (Date.now() - startedAt), 2_000);
    return waitForGameplay(page, {
      hudMarker: options.hudMarker,
      timeoutMs: remainingTimeoutMs,
    });
  }
}

export async function collectDistinctTerminalSnapshots(
  page: Page,
  options: { samples: number; intervalMs: number }
): Promise<string[]> {
  const snapshots: string[] = [];

  for (let index = 0; index < options.samples; index += 1) {
    snapshots.push(await readTerminalText(page));
    if (index < options.samples - 1) {
      await page.waitForTimeout(options.intervalMs);
    }
  }

  return Array.from(new Set(snapshots.filter((snapshot) => snapshot.trim().length > 0)));
}

export async function waitForDistinctTerminalSnapshots(
  page: Page,
  options: { samples: number; intervalMs: number; minimumDistinct: number; timeoutMs?: number }
): Promise<string[]> {
  const startedAt = Date.now();
  let lastSnapshots: string[] = [];

  while (Date.now() - startedAt < (options.timeoutMs ?? 10_000)) {
    lastSnapshots = await collectDistinctTerminalSnapshots(page, {
      samples: options.samples,
      intervalMs: options.intervalMs,
    });
    if (lastSnapshots.length >= options.minimumDistinct) {
      return lastSnapshots;
    }
  }

  throw new Error(
    `Timed out waiting for ${options.minimumDistinct} distinct terminal snapshots. Last snapshots: ${JSON.stringify(
      lastSnapshots
    )}`
  );
}

export async function readIdePerformanceSnapshot(page: Page): Promise<IdePerformanceSnapshot> {
  return withNodeTimeout(
    (async () => {
      const probe = page.getByTestId('ide-perf-probe');
      await probe.waitFor({ state: 'attached', timeout: 2_000 });

      const [
        workerFrameEvents,
        terminalRepaints,
        touchDispatches,
        touchVisuals,
      ] = await Promise.all([
        probe.getAttribute('data-worker-frame-events'),
        probe.getAttribute('data-terminal-repaints'),
        probe.getAttribute('data-touch-dispatches'),
        probe.getAttribute('data-touch-visuals'),
      ]);

      return {
        workerTransport: {
          frameEventsReceived: Number(workerFrameEvents ?? 0),
        },
        terminalRepaint: {
          repaintCount: Number(terminalRepaints ?? 0),
        },
        touchLatency: {
          dispatchCount: Number(touchDispatches ?? 0),
          visualLatencyCount: Number(touchVisuals ?? 0),
        },
      } satisfies IdePerformanceSnapshot;
    })(),
    2_000,
    'IDE performance snapshot read'
  );
}

export async function captureTerminalTelemetryAfterInput(
  page: Page,
  options: {
    trigger: () => Promise<void> | void;
    triggerTimeoutMs?: number;
    timeoutMs?: number;
    activeRunMs?: number;
    requireTouchDispatch?: boolean;
    requireTouchVisual?: boolean;
    pauseBeforeTrigger?: boolean;
  }
): Promise<{
  latencyMs: number;
  accepted: InputAcceptedPayload | null;
  ack: InputProgressAckPayload;
}> {
  if (options.pauseBeforeTrigger) {
    await pauseRuntimeExecution(page);
  }

  const acceptedPromise = withNodeTimeout(
    page.waitForEvent('console', {
      predicate: (message) => parseInputAccepted(message.text()) !== null,
      timeout: options.timeoutMs ?? 8_000,
    }),
    options.timeoutMs ?? 8_000,
    'input acceptance console event'
  );
  const ackPromise = withNodeTimeout(
    page.waitForEvent('console', {
      predicate: (message) => parseInputProgressAck(message.text()) !== null,
      timeout: options.timeoutMs ?? 8_000,
    }),
    options.timeoutMs ?? 8_000,
    'input progress ack console event'
  );

  await withNodeTimeout(
    Promise.resolve(options.trigger()),
    options.triggerTimeoutMs ?? Math.min(options.timeoutMs ?? 8_000, 2_000),
    'terminal telemetry trigger dispatch'
  );

  const acceptedMessage = await acceptedPromise;
  const accepted = parseInputAccepted(acceptedMessage.text());
  if (!accepted) {
    throw new Error(`Missing parseable input acceptance payload: ${acceptedMessage.text()}`);
  }

  const ackMessage = await ackPromise;
  const ack = parseInputProgressAck(ackMessage.text());
  if (!ack) {
    throw new Error(`Missing parseable input progress ack payload: ${ackMessage.text()}`);
  }

  if (options.activeRunMs && options.activeRunMs > 0) {
    await delay(options.activeRunMs);
  }

  const repaintAdvanced = ack.repaintCount > 0;
  const frameAdvanced = ack.frameEventsReceived > 0;
  const touchDispatchAdvanced = !options.requireTouchDispatch || ack.touchDispatchCount > 0;
  const touchVisualAdvanced = !options.requireTouchVisual || ack.touchVisualCount > 0;

  if (repaintAdvanced && frameAdvanced && touchDispatchAdvanced && touchVisualAdvanced) {
    return {
      latencyMs: ack.latencyMs,
      accepted,
      ack,
    };
  }

  throw new Error(
    `Terminal telemetry did not advance after input. Ack=${JSON.stringify(ack)}`
  );
}

export async function waitForVisibleGameplayActivityAfterInput(
  page: Page,
  options: {
    trigger: () => Promise<void> | void;
    timeoutMs?: number;
    samples?: number;
    intervalMs?: number;
    minimumDistinct?: number;
  }
): Promise<{
  latencyMs: number;
  before: string;
  snapshots: string[];
}> {
  const before = await readTerminalText(page);
  const startedAt = Date.now();
  const samples = options.samples ?? 8;
  const intervalMs = options.intervalMs ?? 200;
  const minimumDistinct = options.minimumDistinct ?? 2;
  let lastSnapshots: string[] = [];

  await withNodeTimeout(
    Promise.resolve(options.trigger()),
    Math.min(options.timeoutMs ?? 8_000, 2_000),
    'gameplay activity trigger dispatch'
  );

  while (Date.now() - startedAt < (options.timeoutMs ?? 8_000)) {
    const snapshots = await collectDistinctTerminalSnapshots(page, {
      samples,
      intervalMs,
    });
    const changedSnapshots = snapshots.filter((snapshot) => snapshot !== before);
    lastSnapshots = changedSnapshots;

    if (changedSnapshots.length >= minimumDistinct) {
      return {
        latencyMs: Date.now() - startedAt,
        before,
        snapshots: changedSnapshots,
      };
    }

    await delay(100);
  }

  throw new Error(
    `Timed out waiting for visible gameplay activity after input. Before=${JSON.stringify(
      before
    )} Snapshots=${JSON.stringify(lastSnapshots)}`
  );
}

export async function measureTimeToTerminalTextChange(
  page: Page,
  trigger: () => Promise<void> | void,
  timeout = 2_500
): Promise<number> {
  const before = await readTerminalText(page);
  const startedAt = Date.now();

  await trigger();

  while (Date.now() - startedAt < timeout) {
    if ((await readTerminalText(page)) !== before) {
      return Date.now() - startedAt;
    }
    await delay(50);
  }

  throw new Error('Timed out waiting for terminal text to change');
}

export async function waitForMotionAfterInput(
  page: Page,
  options: {
    trigger: () => Promise<void> | void;
    expectedDirection?: number;
    timeoutMs?: number;
  }
): Promise<{
  latencyMs: number;
  before: NibblesRuntimeMotionState;
  after: NibblesRuntimeMotionState;
}> {
  const perOperationTimeoutMs = Math.min(options.timeoutMs ?? 8_000, 2_000);
  const before = await withNodeTimeout(
    readRuntimeMotionState(page),
    perOperationTimeoutMs,
    'initial runtime motion state'
  );
  const startedAt = Date.now();
  let lastAfter = before;

  await withNodeTimeout(
    Promise.resolve(options.trigger()),
    perOperationTimeoutMs,
    'motion trigger dispatch'
  );

  while (Date.now() - startedAt < (options.timeoutMs ?? 8_000)) {
    const after = await withNodeTimeout(
      readRuntimeMotionState(page),
      perOperationTimeoutMs,
      'runtime motion state after input'
    );
    lastAfter = after;
    const directionMatched =
      options.expectedDirection === undefined ||
      after.direction === options.expectedDirection ||
      after.lastDirection === options.expectedDirection;
    const positionChanged =
      before.posX !== null &&
      before.posY !== null &&
      after.posX !== null &&
      after.posY !== null &&
      (before.posX !== after.posX || before.posY !== after.posY);

    if (
      after.waitingForInput === false &&
      after.moving === 1 &&
      directionMatched &&
      positionChanged
    ) {
      return {
        latencyMs: Date.now() - startedAt,
        before,
        after,
      };
    }

    await delay(100);
  }

  throw new Error(
    `Timed out waiting for motion after input. Before=${JSON.stringify(
      before
    )} After=${JSON.stringify(lastAfter)}`
  );
}
