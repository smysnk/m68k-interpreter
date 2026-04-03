import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterpreterWorkerHost } from '@/runtime/worker/InterpreterWorkerHost';
import type { InterpreterWorkerEvent, WorkerRuntimeSnapshot } from '@/runtime/worker/interpreterWorkerProtocol';

function getLastFrameEvent(events: InterpreterWorkerEvent[]) {
  const frameEvent = [...events].reverse().find((event) => event.type === 'frame');
  if (!frameEvent || frameEvent.type !== 'frame') {
    throw new Error('Expected a frame event');
  }

  return frameEvent;
}

function getLastFrameSnapshot(events: InterpreterWorkerEvent[]): WorkerRuntimeSnapshot {
  return getLastFrameEvent(events).snapshot;
}

function getRequiredTerminalMeta(snapshot: WorkerRuntimeSnapshot) {
  expect(snapshot.terminalMeta).toBeDefined();
  return snapshot.terminalMeta!;
}

function getStoppedReasons(events: InterpreterWorkerEvent[]): string[] {
  return events
    .filter((event): event is Extract<InterpreterWorkerEvent, { type: 'stopped' }> => event.type === 'stopped')
    .map((event) => event.reason);
}

const GEOMETRY_SOURCE = `ORG $1000
TERM_COLS DC.B 0
TERM_ROWS DC.B 0
LAYOUT_PROFILE DC.B 0
VALUE DC.B 7
START
  END START`;

const TOUCH_SOURCE = `ORG $1000
TOUCH_PENDING DC.B 0
TOUCH_PHASE DC.B 0
TOUCH_ROW DC.B 0
TOUCH_COL DC.B 0
TOUCH_FLAGS DC.B 0
TOUCH_ISR BRA TOUCH_HANDLER
START
  TRAP #11
  DC.W 0
TOUCH_HANDLER
  RTS
  END START`;

const HALT_SOURCE = `START
  MOVE.B #'A',D0
  BSR _SPUTCH
  TRAP #11
  DC.W 0
_SPUTCH
  TRAP #15
  DC.W 1
  RTS
  END START`;

const LOOPING_OUTPUT_SOURCE = `START
  MOVE.B #'A',D0
  BSR _SPUTCH
  BRA START
_SPUTCH
  TRAP #15
  DC.W 1
  RTS
  END START`;

const LOOPING_NO_OUTPUT_SOURCE = `START
  BRA START
  END START`;

const WAIT_FOR_INPUT_SOURCE = `RESULT DC.B 0
START
  BSR _SGETCH
  MOVE.B D0,RESULT
  TRAP #11
  DC.W 0
_SGETCH
  TRAP #15
  DC.W 3
  RTS
  END START`;

const EXCEPTION_SOURCE = `START
  MOVE.W #1,D0
  DIVU #0,D0
  END START`;

describe('InterpreterWorkerHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes, loads a program, and seeds geometry-owned symbols inside the worker', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: GEOMETRY_SOURCE,
      columns: 64,
      rows: 18,
    });

    expect(events[0]).toEqual({ type: 'ready' });
    expect(events[1]).toEqual({ type: 'reply', id: 1, ok: true, payload: undefined });

    const snapshot = getLastFrameSnapshot(events);
    const termColsAddress = snapshot.symbols?.TERM_COLS ?? -1;
    const termRowsAddress = snapshot.symbols?.TERM_ROWS ?? -1;
    const layoutProfileAddress = snapshot.symbols?.LAYOUT_PROFILE ?? -1;

    expect(termColsAddress).toBeGreaterThanOrEqual(0);
    expect(termRowsAddress).toBeGreaterThanOrEqual(0);
    expect(layoutProfileAddress).toBeGreaterThanOrEqual(0);
    expect(snapshot.memoryImage?.[termColsAddress]).toBe(64);
    expect(snapshot.memoryImage?.[termRowsAddress]).toBe(18);
    expect(snapshot.memoryImage?.[layoutProfileAddress]).toBe(1);
    const terminalMeta = getRequiredTerminalMeta(snapshot);
    expect(terminalMeta.columns).toBe(64);
    expect(terminalMeta.rows).toBe(18);

    await host.handleCommand({ id: 3, type: 'getSymbolAddress', symbol: 'VALUE' });
    const symbolReply = events.at(-1);
    expect(symbolReply).toEqual({
      type: 'reply',
      id: 3,
      ok: true,
      payload: snapshot.symbols?.VALUE ?? null,
    });
  });

  it('resizes and resets the runtime while keeping geometry seeding inside the worker', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: GEOMETRY_SOURCE,
      columns: 40,
      rows: 20,
    });

    const loadedSnapshot = getLastFrameSnapshot(events);
    const valueAddress = loadedSnapshot.symbols?.VALUE ?? -1;

    await host.handleCommand({ id: 3, type: 'writeMemoryByte', address: valueAddress, value: 42 });
    await host.handleCommand({ id: 4, type: 'resizeTerminal', columns: 30, rows: 24 });
    const resizedSnapshot = getLastFrameSnapshot(events);

    const resizedTerminalMeta = getRequiredTerminalMeta(resizedSnapshot);
    expect(resizedTerminalMeta.columns).toBe(30);
    expect(resizedTerminalMeta.rows).toBe(24);
    expect(resizedSnapshot.memoryImage?.[loadedSnapshot.symbols?.TERM_COLS ?? -1]).toBe(30);
    expect(resizedSnapshot.memoryImage?.[loadedSnapshot.symbols?.TERM_ROWS ?? -1]).toBe(24);
    expect(resizedSnapshot.memoryImage?.[loadedSnapshot.symbols?.LAYOUT_PROFILE ?? -1]).toBe(2);
    expect(resizedSnapshot.memoryImage?.[valueAddress]).toBe(42);

    await host.handleCommand({ id: 5, type: 'reset' });
    const resetSnapshot = getLastFrameSnapshot(events);

    expect(resetSnapshot.memoryImage?.[loadedSnapshot.symbols?.TERM_COLS ?? -1]).toBe(30);
    expect(resetSnapshot.memoryImage?.[loadedSnapshot.symbols?.TERM_ROWS ?? -1]).toBe(24);
    expect(resetSnapshot.memoryImage?.[loadedSnapshot.symbols?.LAYOUT_PROFILE ?? -1]).toBe(2);
    expect(resetSnapshot.memoryImage?.[valueAddress]).toBe(7);
  });

  it('steps inside the worker and reports waiting-for-input as the stop reason', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: WAIT_FOR_INPUT_SOURCE,
      columns: 40,
      rows: 20,
    });

    await host.handleCommand({ id: 3, type: 'step' });
    await host.handleCommand({ id: 4, type: 'step' });
    await host.handleCommand({ id: 5, type: 'step' });
    await host.handleCommand({ id: 6, type: 'step' });

    const snapshot = getLastFrameSnapshot(events);
    const stepReply = events.at(-1);

    expect(stepReply).toEqual({
      type: 'reply',
      id: 6,
      ok: true,
      payload: {
        halted: false,
        waitingForInput: true,
        exception: null,
      },
    });
    expect(snapshot.waitingForInput).toBe(true);
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('waiting_for_input');
    expect(getStoppedReasons(events)).toContain('waiting_for_input');
  });

  it('runs frames inside the worker until the program halts', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: HALT_SOURCE,
      columns: 40,
      rows: 20,
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 0,
        speedMultiplier: 1,
        frameBudgetMs: 20,
      },
    });

    await vi.runAllTimersAsync();

    const snapshot = getLastFrameSnapshot(events);
    expect(snapshot.halted).toBe(true);
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('halted');
    expect(getStoppedReasons(events)).toContain('halted');
    expect(getRequiredTerminalMeta(snapshot).output).toBe('A');
  });

  it('flushes a continuous run early when terminal output changes', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: LOOPING_OUTPUT_SOURCE,
      columns: 40,
      rows: 20,
    });

    events.length = 0;
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 10,
        speedMultiplier: 1,
        frameBudgetMs: 200,
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const snapshot = getLastFrameSnapshot(events);
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('terminal_changed');
    expect((getRequiredTerminalMeta(snapshot).output ?? '').length).toBeGreaterThan(0);
    expect(getStoppedReasons(events)).not.toContain('halted');
  });

  it('omits memory sections from continuous terminal-focused frames when configured', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: LOOPING_OUTPUT_SOURCE,
      columns: 40,
      rows: 20,
    });

    events.length = 0;
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 10,
        speedMultiplier: 1,
        frameBudgetMs: 200,
        publishMemoryDuringContinuousFrames: false,
        terminalFocusedContinuousFrames: true,
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const frameEvent = getLastFrameEvent(events);
    const snapshot = frameEvent.snapshot;
    expect(frameEvent.kind).toBe('terminal');
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('terminal_changed');
    expect(snapshot.memoryMeta).toBeUndefined();
    expect(snapshot.memoryImage).toBeUndefined();
    expect(snapshot.terminalFrameBuffer).toBeDefined();
    expect(getRequiredTerminalMeta(snapshot).output).toBe('');
  });

  it('suppresses continuous gameplay frames until a heartbeat is due when nothing visual changed', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: LOOPING_NO_OUTPUT_SOURCE,
      columns: 40,
      rows: 20,
    });

    events.length = 0;
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 10,
        speedMultiplier: 1,
        frameBudgetMs: 20,
        terminalFocusedContinuousFrames: true,
      },
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(events.filter((event) => event.type === 'frame')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(100);
    const frameEvent = getLastFrameEvent(events);
    expect(frameEvent.kind).toBe('heartbeat');
  });

  it('runs frames inside the worker until input is required', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: WAIT_FOR_INPUT_SOURCE,
      columns: 40,
      rows: 20,
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 0,
        speedMultiplier: 1,
        frameBudgetMs: 20,
      },
    });

    await vi.runAllTimersAsync();

    const snapshot = getLastFrameSnapshot(events);
    expect(snapshot.waitingForInput).toBe(true);
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('waiting_for_input');
    expect(getStoppedReasons(events)).toContain('waiting_for_input');
  });

  it('propagates runtime exceptions through the committed worker frame', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: EXCEPTION_SOURCE,
      columns: 40,
      rows: 20,
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 0,
        speedMultiplier: 1,
        frameBudgetMs: 20,
      },
    });

    await vi.runAllTimersAsync();

    const snapshot = getLastFrameSnapshot(events);
    expect(snapshot.exception).toContain('divide by zero');
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('exception');
    expect(getStoppedReasons(events)).toContain('exception');
  });

  it('omits unchanged terminal sections from continuous worker frame snapshots', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: WAIT_FOR_INPUT_SOURCE,
      columns: 40,
      rows: 20,
    });

    events.length = 0;
    await host.handleCommand({ id: 3, type: 'step' });
    const snapshot = getLastFrameSnapshot(events);

    expect(snapshot.terminalMeta).toBeUndefined();
    expect(snapshot.terminalFrameBuffer).toBeUndefined();
  });

  it('writes a touch packet through the worker with a single command and raises the interrupt', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: TOUCH_SOURCE,
      columns: 40,
      rows: 20,
    });

    const snapshot = getLastFrameSnapshot(events);
    const protocol = {
      touchPending: snapshot.symbols?.TOUCH_PENDING ?? 0,
      touchPhase: snapshot.symbols?.TOUCH_PHASE ?? 0,
      touchRow: snapshot.symbols?.TOUCH_ROW ?? 0,
      touchCol: snapshot.symbols?.TOUCH_COL ?? 0,
      touchFlags: snapshot.symbols?.TOUCH_FLAGS ?? 0,
      touchIsr: snapshot.symbols?.TOUCH_ISR ?? 0,
    };

    await host.handleCommand({
      id: 3,
      type: 'dispatchTouchPacket',
      protocol,
      packet: {
        pending: 1,
        phase: 2,
        row: 9,
        col: 6,
        flags: 0x12,
      },
    });

    expect(events.at(-1)).toEqual({
      type: 'reply',
      id: 3,
      ok: true,
      payload: true,
    });
  });

  it('accepts a one-shot execution pulse while gameplay is already running', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand({
      id: 2,
      type: 'loadProgram',
      source: LOOPING_OUTPUT_SOURCE,
      columns: 40,
      rows: 20,
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 20,
        speedMultiplier: 1,
        frameBudgetMs: 20,
      },
    });

    events.length = 0;
    await host.handleCommand({
      id: 4,
      type: 'pulseExecution',
      frameBudgetMs: 2,
    });

    expect(events.at(-1)).toEqual({
      type: 'reply',
      id: 4,
      ok: true,
      payload: true,
    });
  });
});
