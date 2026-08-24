import type { ProgramImage, ProgramSourceMapEntry } from '../assembler/programImage';
import type { BusAccess } from '../cpu/memoryBus';
import type { StepResult } from '../core/execution';
import { evaluateDebuggerExpression } from './expression';
import type {
  DebugCallFrame,
  DebuggerConfiguration,
  DebuggerExpressionContext,
  DebugProgramDescriptor,
  DebugRunMode,
  DebugSnapshot,
  DebugSourceLocation,
  DebugStop,
  DebugWatchpointSpec,
  ResolvedDebugBreakpoint,
} from './types';

const ADDRESS_MASK = 0x00ff_ffff;
const MAX_DEBUG_LOGS = 200;

export interface DebugSessionHost {
  getPC(): number;
  getSR(): number;
  getCCR(): number;
  getUSP(): number;
  getSSP(): number;
  getVBR(): number;
  getSFC(): number;
  getDFC(): number;
  getRegisters(): Int32Array;
  readMemoryRange(address: number, length: number): Uint8Array;
}

function fingerprintSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function cloneStop(stop: DebugStop | undefined): DebugStop | undefined {
  return stop ? { ...stop, source: stop.source ? { ...stop.source } : undefined } : undefined;
}

export class DebugSession {
  private program: DebugProgramDescriptor | undefined;
  private sourceByAddress = new Map<number, ProgramSourceMapEntry>();
  private addressesByLine = new Map<number, number[]>();
  private breakpoints: ResolvedDebugBreakpoint[] = [];
  private breakpointIndex = new Map<number, ResolvedDebugBreakpoint[]>();
  private watchpoints: DebugWatchpointSpec[] = [];
  private watches: DebuggerConfiguration['watches'] = [];
  private watchValues: DebugSnapshot['watches'] = [];
  private callStack: DebugCallFrame[] = [];
  private logs: string[] = [];
  private stop: DebugStop | undefined;
  private status: DebugSnapshot['status'] = 'idle';
  private runMode: DebugRunMode = { kind: 'continue' };
  private suppression: { breakpointId: string; address: number } | undefined;
  private breakOnException = false;
  private breakOnInterrupt = false;
  private nextFrameId = 1;
  private revision = 1;

  loadProgram(
    image: ProgramImage,
    symbols: Record<string, number>,
    source: string,
    fileId = 'active'
  ): void {
    this.program = {
      fileId,
      fingerprint: fingerprintSource(source),
      loadAddress: image.loadAddress,
      entryPoint: image.entryPoint,
      endAddress: image.endAddress,
      sourceMap: image.sourceMap.map((entry) => ({ ...entry })),
      symbols: { ...symbols },
    };
    this.sourceByAddress.clear();
    this.addressesByLine.clear();
    for (const entry of image.sourceMap) {
      this.sourceByAddress.set(entry.address & ADDRESS_MASK, entry);
      if (entry.kind !== 'instruction') continue;
      const addresses = this.addressesByLine.get(entry.line) ?? [];
      addresses.push(entry.address & ADDRESS_MASK);
      this.addressesByLine.set(entry.line, addresses);
    }
    this.callStack = [];
    this.stop = undefined;
    this.status = 'idle';
    this.resolveBreakpoints();
    this.touch();
  }

  configure(configuration: DebuggerConfiguration): void {
    const priorHitCounts = new Map(this.breakpoints.map((item) => [item.id, item.hitCount]));
    this.breakpoints = configuration.breakpoints.map((breakpoint) => ({
      ...breakpoint,
      addresses: [],
      bound: false,
      hitCount: priorHitCounts.get(breakpoint.id) ?? 0,
    }));
    this.watchpoints = (configuration.watchpoints ?? []).map((item) => ({ ...item }));
    this.watches = (configuration.watches ?? []).map((item) => ({ ...item }));
    this.breakOnException = configuration.breakOnException === true;
    this.breakOnInterrupt = configuration.breakOnInterrupt === true;
    this.resolveBreakpoints();
    this.touch();
  }

  private resolveBreakpoints(): void {
    this.breakpointIndex.clear();
    const program = this.program;
    for (const breakpoint of this.breakpoints) {
      breakpoint.addresses = [];
      breakpoint.bound = false;
      breakpoint.diagnostic = undefined;
      if (breakpoint.kind === 'exception' || breakpoint.kind === 'interrupt') {
        breakpoint.bound = true;
        continue;
      }
      if (!program) {
        breakpoint.diagnostic = 'No program is loaded';
        continue;
      }
      if (breakpoint.kind === 'source') {
        if (breakpoint.fileId && breakpoint.fileId !== program.fileId) {
          breakpoint.diagnostic = 'Breakpoint belongs to another file';
        } else if (breakpoint.line !== undefined) {
          breakpoint.addresses = [...(this.addressesByLine.get(breakpoint.line) ?? [])];
        }
      } else if (breakpoint.kind === 'label' && breakpoint.label) {
        const address = program.symbols[breakpoint.label.toLowerCase()];
        if (address !== undefined && this.sourceByAddress.get(address)?.kind === 'instruction') {
          breakpoint.addresses = [address & ADDRESS_MASK];
        }
      } else if (breakpoint.kind === 'address' && breakpoint.address !== undefined) {
        const address = breakpoint.address & ADDRESS_MASK;
        if (this.sourceByAddress.get(address)?.kind === 'instruction')
          breakpoint.addresses = [address];
      }
      breakpoint.bound = breakpoint.addresses.length > 0;
      if (!breakpoint.bound && !breakpoint.diagnostic)
        breakpoint.diagnostic = 'No executable instruction resolves here';
      for (const address of breakpoint.addresses) {
        const existing = this.breakpointIndex.get(address) ?? [];
        existing.push(breakpoint);
        this.breakpointIndex.set(address, existing);
      }
    }
  }

  beginContinue(): void {
    this.suppressCurrentBreakpoint();
    this.stop = undefined;
    this.status = 'running';
    this.runMode = { kind: 'continue' };
    this.touch();
  }

  beginStepInto(host: DebugSessionHost): void {
    this.suppressCurrentBreakpoint();
    this.stop = undefined;
    this.status = 'running';
    this.runMode = { kind: 'step-into', startPc: host.getPC() };
    this.touch();
  }

  beginStepOver(host: DebugSessionHost): boolean {
    const pc = host.getPC() & ADDRESS_MASK;
    const entry = this.sourceByAddress.get(pc);
    const opcode = this.readWord(host, pc);
    if (!this.isCall(opcode) || !entry) {
      this.beginStepInto(host);
      return false;
    }
    this.suppressCurrentBreakpoint();
    this.stop = undefined;
    this.status = 'running';
    this.runMode = {
      kind: 'step-over',
      startDepth: this.callStack.length,
      fallthrough: (pc + entry.length) & ADDRESS_MASK,
    };
    this.touch();
    return true;
  }

  beginStepOut(): boolean {
    if (this.callStack.length === 0) return false;
    this.suppressCurrentBreakpoint();
    this.stop = undefined;
    this.status = 'running';
    this.runMode = { kind: 'step-out', targetDepth: this.callStack.length - 1 };
    this.touch();
    return true;
  }

  beginRunTo(address: number): void {
    this.suppressCurrentBreakpoint();
    this.stop = undefined;
    this.status = 'running';
    this.runMode = { kind: 'run-to', address: address & ADDRESS_MASK };
    this.touch();
  }

  pause(host: DebugSessionHost): DebugStop {
    if (this.stop) return cloneStop(this.stop)!;
    return this.setStop({
      reason: 'manual-pause',
      pc: host.getPC(),
      source: this.location(host.getPC()),
    });
  }

  beforeInstruction(host: DebugSessionHost): DebugStop | undefined {
    if (this.stop) return this.stop;
    const pc = host.getPC() & ADDRESS_MASK;
    if (
      this.runMode.kind === 'step-over' &&
      pc === this.runMode.fallthrough &&
      this.callStack.length <= this.runMode.startDepth
    ) {
      return this.setStop({ reason: 'step-complete', pc, source: this.location(pc) });
    }
    if (this.runMode.kind === 'step-out' && this.callStack.length <= this.runMode.targetDepth) {
      return this.setStop({ reason: 'step-complete', pc, source: this.location(pc) });
    }
    if (this.runMode.kind === 'run-to' && pc === this.runMode.address) {
      return this.setStop({ reason: 'run-to-cursor', pc, source: this.location(pc) });
    }

    const candidates = this.breakpointIndex.get(pc);
    if (!candidates || candidates.length === 0) return undefined;
    const context = this.expressionContext(host);
    for (const breakpoint of candidates) {
      if (!breakpoint.enabled) continue;
      if (this.suppression?.breakpointId === breakpoint.id && this.suppression.address === pc) {
        this.suppression = undefined;
        continue;
      }
      breakpoint.hitCount += 1;
      if (!this.hitConditionMatches(breakpoint)) continue;
      if (breakpoint.condition) {
        try {
          if (evaluateDebuggerExpression(breakpoint.condition, context) === 0) continue;
          breakpoint.diagnostic = undefined;
        } catch (error) {
          breakpoint.diagnostic = error instanceof Error ? error.message : String(error);
          continue;
        }
      }
      if (breakpoint.logMessage) {
        this.appendLog(this.interpolateLogpoint(breakpoint.logMessage, context));
        if (breakpoint.temporary) breakpoint.enabled = false;
        continue;
      }
      if (breakpoint.temporary) breakpoint.enabled = false;
      return this.setStop({
        reason: 'breakpoint',
        pc,
        source: this.location(pc),
        breakpointId: breakpoint.id,
        message: breakpoint.condition ? `Condition: ${breakpoint.condition}` : undefined,
      });
    }
    return undefined;
  }

  afterInstruction(
    host: DebugSessionHost,
    pcBefore: number,
    result: StepResult,
    accesses: readonly BusAccess[]
  ): DebugStop | undefined {
    if (result.kind !== 'executed' || result.transition !== 'interrupt') {
      this.updateCallStack(host, pcBefore, result);
    }
    const watchStop = this.findWatchpointStop(host, pcBefore, accesses);
    if (watchStop) return this.setStop(watchStop);

    if (result.kind === 'exception') {
      const exceptionBreakpoint = this.breakpoints.find(
        (item) => item.enabled && item.kind === 'exception'
      );
      if (this.breakOnException || exceptionBreakpoint) {
        this.callStack.push(this.createFrame('exception', result.fault.code, result.pc));
        return this.setStop({
          reason: 'exception',
          pc: result.pc,
          source: this.location(result.pc),
          breakpointId: exceptionBreakpoint?.id,
          fault: result.fault,
          message: result.fault.message,
        });
      }
      this.status = 'faulted';
      this.touch();
      return undefined;
    }
    if (result.kind === 'waiting')
      return this.setStop({
        reason: 'waiting-for-input',
        pc: result.pc,
        source: this.location(result.pc),
      });
    if (result.kind === 'halted')
      return this.setStop({ reason: 'halted', pc: result.pc, source: this.location(result.pc) });
    if (result.kind === 'completed')
      return this.setStop({ reason: 'completed', pc: result.pc, source: this.location(result.pc) });
    if (result.kind === 'executed' && result.transition === 'interrupt') {
      const interruptBreakpoint = this.breakpoints.find(
        (item) => item.enabled && item.kind === 'interrupt'
      );
      this.callStack.push(this.createFrame('interrupt', 'Interrupt', result.pcAfter));
      if (this.breakOnInterrupt || interruptBreakpoint) {
        return this.setStop({
          reason: 'interrupt',
          pc: result.pcAfter,
          source: this.location(result.pcAfter),
          breakpointId: interruptBreakpoint?.id,
        });
      }
    }
    if (this.runMode.kind === 'step-into') {
      return this.setStop({
        reason: 'step-complete',
        pc: host.getPC(),
        source: this.location(host.getPC()),
      });
    }
    return undefined;
  }

  clearStop(): void {
    const changed =
      this.stop !== undefined || this.status !== 'idle' || this.runMode.kind !== 'continue';
    this.stop = undefined;
    this.status = 'idle';
    this.runMode = { kind: 'continue' };
    this.suppression = undefined;
    if (changed) this.touch();
  }

  resumeMachineWait(): void {
    if (this.stop?.reason !== 'waiting-for-input') return;
    this.stop = undefined;
    this.status = 'running';
    this.runMode = { kind: 'continue' };
    this.touch();
  }

  invalidateCallStack(): void {
    if (this.callStack.length === 0) return;
    this.callStack = [];
    this.touch();
  }

  hasWatchpoints(): boolean {
    return this.watchpoints.some((item) => item.enabled);
  }

  getStop(): DebugStop | undefined {
    return cloneStop(this.stop);
  }

  getRevision(): number {
    return this.revision;
  }

  getSnapshot(host?: DebugSessionHost): DebugSnapshot {
    if (host) this.evaluateWatches(host);
    return {
      status: this.status,
      stop: cloneStop(this.stop),
      program: this.program
        ? {
            ...this.program,
            sourceMap: this.program.sourceMap.map((item) => ({ ...item })),
            symbols: { ...this.program.symbols },
          }
        : undefined,
      breakpoints: this.breakpoints.map((item) => ({ ...item, addresses: [...item.addresses] })),
      watchpoints: this.watchpoints.map((item) => ({ ...item })),
      watches: this.watchValues.map((item) => ({ ...item })),
      callStack: this.callStack.map((item) => ({
        ...item,
        source: item.source ? { ...item.source } : undefined,
      })),
      logs: [...this.logs],
    };
  }

  private evaluateWatches(host: DebugSessionHost): void {
    const context = this.expressionContext(host);
    const nextValues: DebugSnapshot['watches'] = (this.watches ?? []).map((watch) => {
      try {
        return { ...watch, value: evaluateDebuggerExpression(watch.expression, context) };
      } catch (error) {
        return { ...watch, diagnostic: error instanceof Error ? error.message : String(error) };
      }
    });
    const changed =
      nextValues.length !== this.watchValues.length ||
      nextValues.some((value, index) => {
        const previous = this.watchValues[index];
        return (
          previous?.id !== value.id ||
          previous.expression !== value.expression ||
          previous.value !== value.value ||
          previous.diagnostic !== value.diagnostic
        );
      });
    this.watchValues = nextValues;
    if (changed) this.touch();
  }

  private expressionContext(host: DebugSessionHost): DebuggerExpressionContext {
    const raw = host.getRegisters();
    const registers: Record<string, number> = {
      PC: host.getPC(),
      SR: host.getSR(),
      CCR: host.getCCR(),
      USP: host.getUSP(),
      SSP: host.getSSP(),
      VBR: host.getVBR(),
      SFC: host.getSFC(),
      DFC: host.getDFC(),
    };
    for (let index = 0; index < 8; index += 1) {
      registers[`A${index}`] = raw[index] | 0;
      registers[`D${index}`] = raw[index + 8] | 0;
    }
    return {
      registers,
      symbols: this.program?.symbols ?? {},
      readMemory: (address, size) => {
        const bytes = host.readMemoryRange(address, size);
        let value = 0;
        for (const byte of bytes) value = ((value << 8) | byte) >>> 0;
        return value | 0;
      },
    };
  }

  private findWatchpointStop(
    host: DebugSessionHost,
    pc: number,
    accesses: readonly BusAccess[]
  ): DebugStop | undefined {
    if (this.watchpoints.length === 0) return undefined;
    const context = this.expressionContext(host);
    for (const access of accesses) {
      if (access.type === 'fetch') continue;
      for (const watchpoint of this.watchpoints) {
        if (!watchpoint.enabled) continue;
        if (watchpoint.access !== 'access' && watchpoint.access !== access.type) continue;
        const watchStart = watchpoint.address & ADDRESS_MASK;
        const watchEnd = watchStart + watchpoint.size;
        const accessEnd = access.address + access.size;
        if (access.address >= watchEnd || accessEnd <= watchStart) continue;
        if (watchpoint.condition) {
          try {
            if (evaluateDebuggerExpression(watchpoint.condition, context) === 0) continue;
          } catch {
            continue;
          }
        }
        return {
          reason: 'watchpoint',
          pc: host.getPC(),
          source: this.location(pc),
          watchpointId: watchpoint.id,
          access: { ...access },
        };
      }
    }
    return undefined;
  }

  private updateCallStack(host: DebugSessionHost, pcBefore: number, result: StepResult): void {
    if (result.kind !== 'executed') return;
    const opcode = this.readWord(host, pcBefore);
    if (this.isCall(opcode)) {
      const source = this.sourceByAddress.get(pcBefore);
      this.callStack.push(
        this.createFrame(
          'subroutine',
          this.symbolAt(result.pcAfter) ?? 'Subroutine',
          result.pcAfter,
          source ? pcBefore + source.length : undefined
        )
      );
    } else if (opcode === 0x4e75 || opcode === 0x4e77) {
      const index = this.callStack.map((frame) => frame.kind).lastIndexOf('subroutine');
      if (index >= 0) this.callStack.splice(index, 1);
    } else if (opcode === 0x4e73) {
      let index = -1;
      for (let candidate = this.callStack.length - 1; candidate >= 0; candidate -= 1) {
        if (this.callStack[candidate].kind !== 'subroutine') {
          index = candidate;
          break;
        }
      }
      if (index >= 0) this.callStack.splice(index, 1);
    }
  }

  private isCall(opcode: number): boolean {
    return (opcode & 0xff00) === 0x6100 || (opcode & 0xffc0) === 0x4e80;
  }
  private readWord(host: DebugSessionHost, address: number): number {
    const bytes = host.readMemoryRange(address & ADDRESS_MASK, 2);
    return ((bytes[0] << 8) | bytes[1]) & 0xffff;
  }
  private location(address: number): DebugSourceLocation | undefined {
    const entry = this.sourceByAddress.get(address & ADDRESS_MASK);
    return entry && this.program
      ? { fileId: this.program.fileId, line: entry.line, column: entry.column }
      : undefined;
  }
  private symbolAt(address: number): string | undefined {
    return Object.entries(this.program?.symbols ?? {}).find(
      ([, value]) => value === (address & ADDRESS_MASK)
    )?.[0];
  }
  private createFrame(
    kind: DebugCallFrame['kind'],
    name: string,
    address: number,
    returnAddress?: number
  ): DebugCallFrame {
    return {
      id: `frame-${this.nextFrameId++}`,
      kind,
      name,
      address,
      returnAddress,
      source: this.location(address),
    };
  }
  private setStop(stop: DebugStop): DebugStop {
    this.stop = stop;
    this.status =
      stop.reason === 'waiting-for-input'
        ? 'waiting'
        : stop.reason === 'halted' || stop.reason === 'completed'
          ? 'halted'
          : stop.reason === 'exception'
            ? 'faulted'
            : 'paused';
    this.runMode = { kind: 'continue' };
    this.touch();
    return stop;
  }
  private hitConditionMatches(breakpoint: ResolvedDebugBreakpoint): boolean {
    const condition = breakpoint.hitCondition;
    if (!condition) return true;
    if (!Number.isInteger(condition.value) || condition.value <= 0) return false;
    if (condition.operator === '==') return breakpoint.hitCount === condition.value;
    if (condition.operator === '>=') return breakpoint.hitCount >= condition.value;
    return breakpoint.hitCount % condition.value === 0;
  }
  private interpolateLogpoint(message: string, context: DebuggerExpressionContext): string {
    return message.replace(/\{([^{}]+)\}/g, (_match, expression: string) => {
      try {
        return String(evaluateDebuggerExpression(expression, context));
      } catch (error) {
        return `<${error instanceof Error ? error.message : String(error)}>`;
      }
    });
  }
  private appendLog(message: string): void {
    this.logs.push(message.slice(0, 1_024));
    if (this.logs.length > MAX_DEBUG_LOGS) this.logs.splice(0, this.logs.length - MAX_DEBUG_LOGS);
    this.touch();
  }
  private suppressCurrentBreakpoint(): void {
    if (this.stop?.reason === 'breakpoint' && this.stop.breakpointId) {
      this.suppression = { breakpointId: this.stop.breakpointId, address: this.stop.pc };
    }
  }

  private touch(): void {
    this.revision += 1;
  }
}
