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
}

export type StepResult =
  | {
      kind: 'executed';
      pcBefore: number;
      pcAfter: number;
      cycles?: number;
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
