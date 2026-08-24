import type { StepResult } from '../core/execution';
import type { StrictM68000Core } from '../cpu/core';
import type { MemoryBus } from '../cpu/memoryBus';
import type { Easy68kGraphicsDevice } from '../devices/easy68kGraphics';
import type { Easy68kSoundDevice } from '../devices/easy68kSound';
import type { TerminalDevice } from '../devices/terminal';

export interface Easy68kTrapContext {
  core: StrictM68000Core;
  inputQueue: number[];
  setWaiting(task: number): void;
  clearWaiting(): void;
  halt(): void;
}

interface Easy68kServiceEnvironment {
  bus: MemoryBus;
  terminal: TerminalDevice;
  graphics: Easy68kGraphicsDevice;
  sound: Easy68kSoundDevice;
}

type ServiceOutcome = 'executed' | 'waiting' | 'halted';

export interface Easy68kTrapService {
  readonly task: number;
  readonly name: string;
  execute(context: Easy68kTrapContext): ServiceOutcome;
}

function signedWord(value: number): number {
  return (value << 16) >> 16;
}

function setLowByte(core: StrictM68000Core, register: number, value: number): void {
  core.state.d[register] = (core.state.d[register] & 0xffff_ff00) | (value & 0xff);
}

function setLowWord(core: StrictM68000Core, register: number, value: number): void {
  core.state.d[register] = (core.state.d[register] & 0xffff_0000) | (value & 0xffff);
}

function readNullTerminatedString(bus: MemoryBus, address: number, limit = 1024): string {
  let value = '';
  for (let offset = 0; offset < limit; offset += 1) {
    const byte = bus.read8((address + offset) >>> 0);
    if (byte === 0) break;
    value += String.fromCharCode(byte);
  }
  return value;
}

function terminalServices(environment: Easy68kServiceEnvironment): Easy68kTrapService[] {
  return [
    {
      task: 5,
      name: 'read-character',
      execute(context) {
        if (context.inputQueue.length === 0) {
          context.setWaiting(5);
          return 'waiting';
        }
        setLowByte(context.core, 1, context.inputQueue.shift() ?? 0);
        return 'executed';
      },
    },
    {
      task: 6,
      name: 'write-character',
      execute(context) {
        environment.terminal.writeByte(context.core.state.d[1] & 0xff);
        return 'executed';
      },
    },
    {
      task: 7,
      name: 'poll-character',
      execute(context) {
        setLowByte(context.core, 1, context.inputQueue.length > 0 ? 1 : 0);
        return 'executed';
      },
    },
    {
      task: 9,
      name: 'terminate',
      execute(context) {
        context.halt();
        return 'halted';
      },
    },
    {
      task: 11,
      name: 'cursor-or-clear',
      execute(context) {
        const request = context.core.state.d[1] & 0xffff;
        if (request === 0xff00) {
          environment.terminal.clear();
          environment.graphics.clear();
        } else if (request === 0x00ff) {
          const meta = environment.terminal.getTerminalMeta();
          setLowWord(context.core, 1, ((meta.cursorColumn & 0xff) << 8) | (meta.cursorRow & 0xff));
        } else {
          environment.terminal.setCursor((request >>> 8) & 0xff, request & 0xff);
        }
        return 'executed';
      },
    },
  ];
}

function graphicsServices(environment: Easy68kServiceEnvironment): Easy68kTrapService[] {
  const registerWord = (context: Easy68kTrapContext, index: number) =>
    signedWord(context.core.state.d[index] & 0xffff);
  return [
    {
      task: 33,
      name: 'output-window',
      execute(context) {
        const request = context.core.state.d[1] >>> 0;
        if (request === 0) {
          const state = environment.graphics.getState();
          context.core.state.d[1] = ((state.width & 0xffff) << 16) | (state.height & 0xffff);
        } else if (request !== 1 && request !== 2) {
          environment.graphics.resize((request >>> 16) & 0xffff, request & 0xffff);
        }
        return 'executed';
      },
    },
    {
      task: 80,
      name: 'set-pen-color',
      execute(context) {
        environment.graphics.setPenColor(context.core.state.d[1]);
        return 'executed';
      },
    },
    {
      task: 81,
      name: 'set-fill-color',
      execute(context) {
        environment.graphics.setFillColor(context.core.state.d[1]);
        return 'executed';
      },
    },
    {
      task: 82,
      name: 'draw-pixel',
      execute(context) {
        environment.graphics.drawPixel(registerWord(context, 1), registerWord(context, 2));
        return 'executed';
      },
    },
    {
      task: 83,
      name: 'get-pixel',
      execute(context) {
        context.core.state.d[0] = environment.graphics.getPixel(
          registerWord(context, 1),
          registerWord(context, 2)
        );
        return 'executed';
      },
    },
    {
      task: 84,
      name: 'draw-line',
      execute(context) {
        environment.graphics.drawLine(
          registerWord(context, 1),
          registerWord(context, 2),
          registerWord(context, 3),
          registerWord(context, 4)
        );
        return 'executed';
      },
    },
    {
      task: 85,
      name: 'draw-line-to',
      execute(context) {
        environment.graphics.drawLineTo(registerWord(context, 1), registerWord(context, 2));
        return 'executed';
      },
    },
    {
      task: 86,
      name: 'move-pen',
      execute(context) {
        environment.graphics.moveTo(registerWord(context, 1), registerWord(context, 2));
        return 'executed';
      },
    },
    {
      task: 87,
      name: 'draw-filled-rectangle',
      execute(context) {
        environment.graphics.drawRectangle(
          registerWord(context, 1),
          registerWord(context, 2),
          registerWord(context, 3),
          registerWord(context, 4),
          true
        );
        return 'executed';
      },
    },
    {
      task: 88,
      name: 'draw-filled-ellipse',
      execute(context) {
        environment.graphics.drawEllipse(
          registerWord(context, 1),
          registerWord(context, 2),
          registerWord(context, 3),
          registerWord(context, 4),
          true
        );
        return 'executed';
      },
    },
    {
      task: 89,
      name: 'flood-fill',
      execute(context) {
        environment.graphics.floodFill(registerWord(context, 1), registerWord(context, 2));
        return 'executed';
      },
    },
    {
      task: 90,
      name: 'draw-rectangle',
      execute(context) {
        environment.graphics.drawRectangle(
          registerWord(context, 1),
          registerWord(context, 2),
          registerWord(context, 3),
          registerWord(context, 4),
          false
        );
        return 'executed';
      },
    },
    {
      task: 91,
      name: 'draw-ellipse',
      execute(context) {
        environment.graphics.drawEllipse(
          registerWord(context, 1),
          registerWord(context, 2),
          registerWord(context, 3),
          registerWord(context, 4),
          false
        );
        return 'executed';
      },
    },
    {
      task: 92,
      name: 'set-drawing-mode',
      execute(context) {
        environment.graphics.setDrawingMode(context.core.state.d[1] & 0xff);
        return 'executed';
      },
    },
    {
      task: 93,
      name: 'set-pen-width',
      execute(context) {
        environment.graphics.setPenWidth(context.core.state.d[1] & 0xff);
        return 'executed';
      },
    },
    {
      task: 94,
      name: 'repaint',
      execute() {
        environment.graphics.repaint();
        return 'executed';
      },
    },
    {
      task: 95,
      name: 'draw-text',
      execute(context) {
        const text = readNullTerminatedString(environment.bus, context.core.state.a[1] >>> 0);
        environment.graphics.drawText(text, registerWord(context, 1), registerWord(context, 2));
        return 'executed';
      },
    },
    {
      task: 96,
      name: 'get-pen-position',
      execute(context) {
        const point = environment.graphics.getPoint();
        setLowWord(context.core, 1, point.x);
        setLowWord(context.core, 2, point.y);
        return 'executed';
      },
    },
  ];
}

function soundServices(environment: Easy68kServiceEnvironment): Easy68kTrapService[] {
  const path = (context: Easy68kTrapContext) =>
    readNullTerminatedString(environment.bus, context.core.state.a[1] >>> 0);
  const reference = (context: Easy68kTrapContext) => context.core.state.d[1] & 0xff;
  const result = (context: Easy68kTrapContext, success: boolean) => {
    setLowWord(context.core, 0, success ? 1 : 0);
    return 'executed' as const;
  };
  const withResult = (task: number, context: Easy68kTrapContext, operation: () => boolean) => {
    const success = operation();
    environment.sound.recordTaskResult(task, success);
    return result(context, success);
  };
  return [
    {
      task: 70,
      name: 'play-standard-path',
      execute(context) {
        return withResult(70, context, () => environment.sound.playPath('standard', path(context)));
      },
    },
    {
      task: 71,
      name: 'load-standard-reference',
      execute(context) {
        const success = environment.sound.loadReference(
          'standard',
          reference(context),
          path(context)
        );
        environment.sound.recordTaskResult(71, success);
        return 'executed';
      },
    },
    {
      task: 72,
      name: 'play-standard-reference',
      execute(context) {
        return withResult(72, context, () =>
          environment.sound.playReference('standard', reference(context))
        );
      },
    },
    {
      task: 73,
      name: 'play-polyphonic-path',
      execute(context) {
        return withResult(73, context, () =>
          environment.sound.playPath('polyphonic', path(context))
        );
      },
    },
    {
      task: 74,
      name: 'load-polyphonic-reference',
      execute(context) {
        return withResult(74, context, () =>
          environment.sound.loadReference('polyphonic', reference(context), path(context))
        );
      },
    },
    {
      task: 75,
      name: 'play-polyphonic-reference',
      execute(context) {
        return withResult(75, context, () =>
          environment.sound.playReference('polyphonic', reference(context))
        );
      },
    },
    {
      task: 76,
      name: 'control-standard-player',
      execute(context) {
        return withResult(76, context, () =>
          environment.sound.control('standard', reference(context), context.core.state.d[2] >>> 0)
        );
      },
    },
    {
      task: 77,
      name: 'control-polyphonic-player',
      execute(context) {
        return withResult(77, context, () =>
          environment.sound.control('polyphonic', reference(context), context.core.state.d[2] >>> 0)
        );
      },
    },
  ];
}

export class Easy68kTrapDispatcher {
  private readonly services: ReadonlyMap<number, Easy68kTrapService>;

  constructor(private readonly environment: Easy68kServiceEnvironment) {
    const entries = [
      ...terminalServices(environment),
      ...graphicsServices(environment),
      ...soundServices(environment),
    ];
    this.services = new Map(entries.map((service) => [service.task, service]));
  }

  handle(context: Easy68kTrapContext): StepResult | undefined {
    const pcBefore = context.core.state.pc >>> 0;
    const opcode = this.environment.bus.read16(pcBefore, 'fetch');
    if (opcode !== 0x4e4f) return undefined;
    const task = context.core.state.d[0] & 0xff;
    const service = this.services.get(task);
    if (!service) {
      return {
        kind: 'exception',
        pc: pcBefore,
        fault: {
          code: 'unsupported-easy68k-task',
          message: `Unsupported Easy68K TRAP #15 task: ${task}`,
          address: pcBefore,
        },
      };
    }
    const pcAfter = context.core.normalizeAddress(pcBefore + 2);
    const outcome = service.execute(context);
    context.core.state.pc = pcAfter;
    if (outcome !== 'waiting') context.clearWaiting();
    if (outcome === 'waiting') return { kind: 'waiting', pc: pcAfter };
    if (outcome === 'halted') return { kind: 'halted', pc: pcAfter };
    return { kind: 'executed', pcBefore, pcAfter };
  }
}
