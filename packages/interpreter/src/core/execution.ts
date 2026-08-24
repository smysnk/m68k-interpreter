export type DiagnosticSeverity = 'error' | 'warning' | 'information';

export interface SourceSpan {
  line: number;
  column?: number;
  length?: number;
}

export interface CpuDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  source?: SourceSpan;
  instructionAddress?: number;
}

export interface CpuFault {
  code: string;
  message: string;
  vector?: number;
  address?: number;
  source?: SourceSpan;
  origin?:
    | { kind: 'cpu' }
    | { kind: 'machine-bus' }
    | { kind: 'translator'; device?: string }
    | { kind: 'coprocessor'; slot: number; device?: string };
}

export type StepResult =
  | {
      kind: 'executed';
      pcBefore: number;
      pcAfter: number;
      cycles?: number;
      transition?: 'instruction' | 'interrupt';
    }
  | {
      kind: 'waiting';
      pc: number;
    }
  | {
      kind: 'halted';
      pc: number;
    }
  | {
      kind: 'completed';
      pc: number;
    }
  | {
      kind: 'exception';
      pc: number;
      fault: CpuFault;
    };
