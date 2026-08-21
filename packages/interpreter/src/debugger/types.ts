import type { ProgramSourceMapEntry } from '../assembler/programImage';
import type { CpuFault } from '../core/execution';
import type { BusAccess } from '../cpu/memoryBus';

export type DebugStopReason =
  | 'breakpoint'
  | 'watchpoint'
  | 'manual-pause'
  | 'step-complete'
  | 'run-to-cursor'
  | 'exception'
  | 'interrupt'
  | 'waiting-for-input'
  | 'halted'
  | 'completed';

export type DebugBreakpointKind = 'source' | 'address' | 'label' | 'exception' | 'interrupt';

export interface DebugHitCondition {
  operator: '==' | '>=' | '%';
  value: number;
}

export interface DebugBreakpointSpec {
  id: string;
  enabled: boolean;
  kind: DebugBreakpointKind;
  fileId?: string;
  line?: number;
  address?: number;
  label?: string;
  condition?: string;
  hitCondition?: DebugHitCondition;
  logMessage?: string;
  temporary?: boolean;
}

export interface ResolvedDebugBreakpoint extends DebugBreakpointSpec {
  addresses: number[];
  bound: boolean;
  hitCount: number;
  diagnostic?: string;
}

export type DebugWatchpointAccess = 'read' | 'write' | 'access';

export interface DebugWatchpointSpec {
  id: string;
  enabled: boolean;
  address: number;
  size: 1 | 2 | 4;
  access: DebugWatchpointAccess;
  condition?: string;
}

export interface DebugWatchExpression {
  id: string;
  expression: string;
}

export interface DebugWatchValue extends DebugWatchExpression {
  value?: number;
  diagnostic?: string;
}

export interface DebugSourceLocation {
  fileId: string;
  line: number;
  column?: number;
}

export interface DebugStop {
  reason: DebugStopReason;
  pc: number;
  source?: DebugSourceLocation;
  breakpointId?: string;
  watchpointId?: string;
  access?: BusAccess;
  fault?: CpuFault;
  message?: string;
}

export type ExecutionStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'running' }
  | { kind: 'paused'; stop: DebugStop }
  | { kind: 'waiting'; stop: DebugStop }
  | { kind: 'halted'; stop: DebugStop }
  | { kind: 'faulted'; stop: DebugStop; fault: CpuFault };

export type DebugFrameKind = 'subroutine' | 'exception' | 'interrupt';

export interface DebugCallFrame {
  id: string;
  kind: DebugFrameKind;
  name: string;
  address: number;
  returnAddress?: number;
  source?: DebugSourceLocation;
}

export interface DebugProgramDescriptor {
  fileId: string;
  fingerprint: string;
  loadAddress: number;
  entryPoint: number;
  endAddress: number;
  sourceMap: ProgramSourceMapEntry[];
  symbols: Record<string, number>;
}

export type DebugRunMode =
  | { kind: 'continue' }
  | { kind: 'step-into'; startPc: number }
  | { kind: 'step-over'; startDepth: number; fallthrough: number }
  | { kind: 'step-out'; targetDepth: number }
  | { kind: 'run-to'; address: number };

export interface DebugSnapshot {
  status: 'idle' | 'running' | 'paused' | 'waiting' | 'halted' | 'faulted';
  stop?: DebugStop;
  program?: DebugProgramDescriptor;
  breakpoints: ResolvedDebugBreakpoint[];
  watchpoints: DebugWatchpointSpec[];
  watches: DebugWatchValue[];
  callStack: DebugCallFrame[];
  logs: string[];
}

export interface DebuggerConfiguration {
  breakpoints: DebugBreakpointSpec[];
  watchpoints?: DebugWatchpointSpec[];
  watches?: DebugWatchExpression[];
  breakOnException?: boolean;
  breakOnInterrupt?: boolean;
}

export interface DebuggerExpressionContext {
  registers: Readonly<Record<string, number>>;
  symbols: Readonly<Record<string, number>>;
  readMemory(address: number, size: 1 | 2 | 4): number;
}
