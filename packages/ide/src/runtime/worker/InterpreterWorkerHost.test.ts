import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterpreterWorkerHost } from '@/runtime/worker/InterpreterWorkerHost';
import type {
  InterpreterWorkerEvent,
  InterpreterWorkerCommand,
  WorkerRuntimeSnapshot,
} from '@/runtime/worker/interpreterWorkerProtocol';

function loadProgramCommand(
  id: number,
  source: string,
  columns = 40,
  rows = 20
): InterpreterWorkerCommand {
  return {
    id,
    type: 'loadProgram',
    request: {
      source,
      debugFileId: 'worker-test.asm',
      emulation: { cpuModel: 'm68000', machineProfile: 'easy68k' },
      terminal: { columns, rows },
      hardwareDevices: [
        {
          id: 'easy68k-default',
          deviceType: 'board',
          displayBase: 0xe00000,
          ledAddress: 0xe00010,
          switchAddress: 0xe00010,
          buttonAddress: 0xe00012,
        },
      ],
      execution: { delayMs: 0, speedMultiplier: 1 },
      undo: { mode: 'full' },
    },
  };
}

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
    .filter(
      (event): event is Extract<InterpreterWorkerEvent, { type: 'stopped' }> =>
        event.type === 'stopped'
    )
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
  MOVEQ #9,D0
  TRAP #15
TOUCH_HANDLER
  RTS
  END START`;

const HALT_SOURCE = `START
  MOVE.B #'A',D1
  MOVEQ #6,D0
  TRAP #15
  MOVEQ #9,D0
  TRAP #15
  END START`;

const LOOPING_OUTPUT_SOURCE = `START
  MOVE.B #'A',D1
  MOVEQ #6,D0
  TRAP #15
  BRA START
  END START`;

const LOOPING_NO_OUTPUT_SOURCE = `START
  BRA START
  END START`;

const DEBUG_LOOP_SOURCE = `START
  MOVEQ #0,D0
LOOP
  ADDQ.L #1,D0
  BRA LOOP
  END START`;

const WAIT_FOR_INPUT_SOURCE = `RESULT DC.B 0
START
  BSR _SGETCH
  MOVE.B D1,RESULT
  MOVEQ #9,D0
  TRAP #15
_SGETCH
  MOVEQ #5,D0
  TRAP #15
  RTS
  END START`;

const EXCEPTION_SOURCE = `START
  MOVE.W #1,D0
  DIVU #0,D0
  END START`;

const AUTO_IRQ_SOURCE = `ORG $64
IRQ1_VECTOR DC.L IRQ1_HANDLER
ORG $1000
START
  BRA START
IRQ1_HANDLER
  ADDQ.B #1,IRQ_COUNT
  RTE
IRQ_COUNT DC.B 0
  END START`;

describe('InterpreterWorkerHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes structured breakpoint and step stops with worker parity', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => events.push(event));
    await host.handleCommand(loadProgramCommand(1, DEBUG_LOOP_SOURCE));
    await host.handleCommand({
      id: 2,
      type: 'configureDebugger',
      configuration: {
        breakpoints: [
          {
            id: 'loop-breakpoint',
            enabled: true,
            kind: 'source',
            fileId: 'worker-test.asm',
            line: 4,
          },
        ],
      },
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: { delayMs: 0, speedMultiplier: 1, frameBudgetMs: 5 },
    });
    await vi.advanceTimersByTimeAsync(0);

    const breakpointStop = [...events]
      .reverse()
      .find((event) => event.type === 'stopped' && event.stop?.reason === 'breakpoint');
    expect(breakpointStop).toMatchObject({
      type: 'stopped',
      reason: 'breakpoint',
      stop: { reason: 'breakpoint', breakpointId: 'loop-breakpoint', source: { line: 4 } },
    });
    const breakpointPc = breakpointStop?.type === 'stopped' ? breakpointStop.stop?.pc : undefined;

    await host.handleCommand({ id: 4, type: 'step' });
    const stepStop = [...events]
      .reverse()
      .find((event) => event.type === 'stopped' && event.stop?.reason === 'step-complete');
    expect(stepStop).toMatchObject({ type: 'stopped', stop: { reason: 'step-complete' } });
    expect(stepStop?.type === 'stopped' ? stepStop.stop?.pc : undefined).not.toBe(breakpointPc);
  });

  it('publishes one complete manual-pause frame before the stopped event and reply', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => events.push(event));
    await host.handleCommand(loadProgramCommand(1, DEBUG_LOOP_SOURCE));
    await host.handleCommand({
      id: 2,
      type: 'configureDebugger',
      configuration: { breakpoints: [] },
    });
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: { delayMs: 10, speedMultiplier: 1, frameBudgetMs: 1 },
    });
    await vi.advanceTimersByTimeAsync(0);

    const continuousFrame = getLastFrameEvent(events);
    expect(continuousFrame.snapshot.debugSnapshot?.status).toBe('running');
    events.length = 0;
    await vi.advanceTimersByTimeAsync(10);
    expect(getLastFrameEvent(events).snapshot.debugSnapshot).toBeUndefined();

    events.length = 0;
    await host.handleCommand({ id: 4, type: 'pause' });
    expect(events.map((event) => event.type)).toEqual(['frame', 'stopped', 'reply']);
    const pauseFrame = getLastFrameEvent(events);
    expect(pauseFrame.snapshot.debugSnapshot).toMatchObject({
      status: 'paused',
      stop: {
        reason: 'manual-pause',
        source: { fileId: 'worker-test.asm' },
      },
    });
    expect(pauseFrame.snapshot.runtimeMetrics?.lastStopReason).toBe('manual-pause');

    events.length = 0;
    await host.handleCommand({ id: 5, type: 'pause' });
    expect(events).toEqual([{ type: 'reply', id: 5, ok: true, payload: undefined }]);
  });

  it('publishes compact hardware-only frames for panel input and configuration commands', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => events.push(event));

    await host.handleCommand(loadProgramCommand(1, GEOMETRY_SOURCE, 80, 25));
    events.length = 0;

    await host.handleCommand({ id: 2, type: 'setHardwareToggle', bit: 7, enabled: true });
    const toggleFrame = getLastFrameEvent(events);
    expect(toggleFrame.kind).toBe('hardware');
    expect(toggleFrame.snapshot.hardwareSnapshot).toMatchObject({ switches: 0x80 });
    expect(toggleFrame.snapshot.memoryImage).toBeUndefined();
    expect(toggleFrame.snapshot.terminalFrameBuffer).toBeUndefined();

    await host.handleCommand({
      id: 3,
      type: 'configureHardware',
      config: {
        displayBase: 0xe00100,
        ledAddress: 0xe00110,
        switchAddress: 0xe00110,
        buttonAddress: 0xe00112,
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'reply',
      id: 3,
      ok: true,
      payload: { valid: true, conflicts: [], errors: [] },
    });
    expect(getLastFrameSnapshot(events).hardwareSnapshot?.config.displayBase).toBe(0xe00100);

    await host.handleCommand({
      id: 4,
      type: 'configureHardwareDevices',
      devices: [
        {
          id: 'display-a',
          deviceType: 'display',
          displayBase: 0xe00000,
        },
        {
          id: 'digital-a',
          deviceType: 'digital-io',
          ledAddress: 0xe00040,
          switchAddress: 0xe00040,
          buttonAddress: 0xe00042,
        },
      ],
    });
    expect(events.at(-1)).toMatchObject({
      type: 'reply',
      id: 4,
      ok: true,
      payload: { valid: true, conflicts: [], errors: [] },
    });
    expect(getLastFrameSnapshot(events).hardwareSnapshot?.devices).toHaveLength(2);

    await host.handleCommand({
      id: 5,
      type: 'setHardwareToggle',
      deviceId: 'digital-a',
      bit: 0,
      enabled: true,
    });
    expect(
      getLastFrameSnapshot(events).hardwareSnapshot?.devices.find(
        (device) => device.id === 'digital-a'
      )?.switches
    ).toBe(1);
  });

  it('runs a bounded automatic IRQ scheduler and cancels it deterministically', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => events.push(event));
    await host.handleCommand(loadProgramCommand(1, AUTO_IRQ_SOURCE, 80, 25));
    const countAddress = getLastFrameSnapshot(events).symbols?.IRQ_COUNT ?? -1;
    await host.handleCommand({
      id: 2,
      type: 'configureAutomaticInterrupts',
      config: { levels: [1, 1], intervalMs: 10 },
    });

    await vi.advanceTimersByTimeAsync(50);
    await host.handleCommand({ id: 3, type: 'step' });
    await host.handleCommand({ id: 4, type: 'step' });
    await host.handleCommand({ id: 5, type: 'step' });
    await host.handleCommand({ id: 6, type: 'readMemoryRange', address: countAddress, length: 1 });
    expect(events.at(-1)).toMatchObject({ payload: [1] });

    await host.handleCommand({ id: 7, type: 'cancelAutomaticInterrupts' });
    await vi.advanceTimersByTimeAsync(500);
    await host.handleCommand({ id: 8, type: 'step' });
    await host.handleCommand({ id: 9, type: 'readMemoryRange', address: countAddress, length: 1 });
    expect(events.at(-1)).toMatchObject({ payload: [1] });
  });

  it('initializes, loads a program, and seeds geometry-owned symbols inside the worker', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand(loadProgramCommand(2, GEOMETRY_SOURCE, 64, 18));

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
    await host.handleCommand(loadProgramCommand(2, GEOMETRY_SOURCE));

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
    await host.handleCommand(loadProgramCommand(2, WAIT_FOR_INPUT_SOURCE));

    await host.handleCommand({ id: 3, type: 'step' });
    await host.handleCommand({ id: 4, type: 'step' });
    await host.handleCommand({ id: 5, type: 'step' });
    await host.handleCommand({ id: 6, type: 'step' });

    const snapshot = getLastFrameSnapshot(events);
    const stepReply = events.at(-1);

    expect(stepReply).toMatchObject({
      type: 'reply',
      id: 6,
      ok: true,
      payload: {
        halted: false,
        waitingForInput: true,
        debugStop: { reason: 'waiting-for-input' },
        exception: null,
      },
    });
    expect(snapshot.waitingForInput).toBe(true);
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('waiting-for-input');
    expect(getStoppedReasons(events)).toContain('waiting-for-input');
  });

  it('runs frames inside the worker until the program halts', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand(loadProgramCommand(2, HALT_SOURCE));
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
    await host.handleCommand(loadProgramCommand(2, LOOPING_OUTPUT_SOURCE));

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
    await host.handleCommand(loadProgramCommand(2, LOOPING_OUTPUT_SOURCE));

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
    await host.handleCommand(loadProgramCommand(2, LOOPING_NO_OUTPUT_SOURCE));

    events.length = 0;
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: {
        delayMs: 100,
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
    await host.handleCommand(loadProgramCommand(2, WAIT_FOR_INPUT_SOURCE));
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
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('waiting-for-input');
    expect(getStoppedReasons(events)).toContain('waiting-for-input');
  });

  it('preserves a worker input wait during debugger attachment and steps after one input', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand(loadProgramCommand(2, WAIT_FOR_INPUT_SOURCE));
    await host.handleCommand({
      id: 3,
      type: 'run',
      config: { delayMs: 0, speedMultiplier: 1, frameBudgetMs: 20 },
    });
    await vi.runAllTimersAsync();

    events.length = 0;
    await host.handleCommand({ id: 4, type: 'pause' });
    expect(getStoppedReasons(events)).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'reply', id: 4, ok: true });

    await host.handleCommand({ id: 5, type: 'queueInput', input: 'w' });
    await host.handleCommand({ id: 6, type: 'step' });

    const snapshot = getLastFrameSnapshot(events);
    expect(snapshot.waitingForInput).toBe(false);
    expect(snapshot.debugSnapshot?.stop).toMatchObject({ reason: 'step-complete' });
    expect(snapshot.runtimeMetrics?.lastStopReason).toBe('step-complete');
    expect(getStoppedReasons(events)).toContain('step-complete');
  });

  it('propagates runtime exceptions through the committed worker frame', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => {
      events.push(event);
    });

    await host.handleCommand({ id: 1, type: 'init' });
    await host.handleCommand(loadProgramCommand(2, EXCEPTION_SOURCE));
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
    await host.handleCommand(loadProgramCommand(2, WAIT_FOR_INPUT_SOURCE));

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
    await host.handleCommand(loadProgramCommand(2, TOUCH_SOURCE));

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
    await host.handleCommand(loadProgramCommand(2, LOOPING_OUTPUT_SOURCE));
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

  it('publishes graphics patches and ordered sound commands without memory images', async () => {
    const events: InterpreterWorkerEvent[] = [];
    const host = new InterpreterWorkerHost((event) => events.push(event));
    const command = loadProgramCommand(
      1,
      `PATH DC.B 'tone.wav',0
START
  MOVE.L #$000000FF,D1
  MOVEQ #80,D0
  TRAP #15
  MOVE.W #2,D1
  MOVE.W #3,D2
  MOVEQ #82,D0
  TRAP #15
  LEA PATH,A1
  MOVEQ #70,D0
  TRAP #15
  MOVEQ #9,D0
  TRAP #15
  END START`
    );
    const wav = new Uint8Array(44);
    wav.set(
      [...'RIFF'].map((character) => character.charCodeAt(0)),
      0
    );
    new DataView(wav.buffer).setUint32(4, 36, true);
    wav.set(
      [...'WAVE'].map((character) => character.charCodeAt(0)),
      8
    );
    wav.set(
      [...'fmt '].map((character) => character.charCodeAt(0)),
      12
    );
    new DataView(wav.buffer).setUint32(16, 16, true);
    wav.set(
      [...'data'].map((character) => character.charCodeAt(0)),
      36
    );
    if (command.type !== 'loadProgram') throw new Error('Expected load command');
    command.request.soundAssets = [{ id: 'tone', path: 'tone.wav', bytes: wav }];
    await host.handleCommand(command);
    events.length = 0;
    await host.handleCommand({
      id: 2,
      type: 'run',
      config: { delayMs: 0, speedMultiplier: 1, frameBudgetMs: 8 },
    });
    await vi.runAllTimersAsync();
    const multimediaFrames = events.filter(
      (event) =>
        event.type === 'frame' && (event.snapshot.graphicsPatch || event.snapshot.soundSnapshot)
    );
    expect(multimediaFrames.length).toBeGreaterThan(0);
    const latestEvent = multimediaFrames.at(-1);
    if (!latestEvent || latestEvent.type !== 'frame') throw new Error('Expected multimedia frame');
    const latest = latestEvent.snapshot;
    expect(latest.graphicsPatch?.pixels).toBeInstanceOf(Uint32Array);
    expect(latest.soundSnapshot?.pendingCommands.map((entry) => entry.type)).toContain('play');
    expect(latest.memoryImage).toBeUndefined();
  });
});
