export type InterpreterInstruction = [instruction: string, line: number, isDirective: boolean];

export interface LoadedProgramState {
  source: string;
  instructions: InterpreterInstruction[];
  sourceLines: string[];
  codeLabels: Record<string, number>;
  symbols: Record<string, number>;
  symbolLookup: Record<string, number>;
  memoryImage: Record<number, number>;
  endPointer?: [number, number];
  entryLabel?: string;
  orgAddress?: number;
}

export interface TerminalStyleState {
  foreground: number | null;
  background: number | null;
  bold: boolean;
  inverse: boolean;
}

export interface TerminalCellState extends TerminalStyleState {
  char: string;
}

export interface TerminalState {
  columns: number;
  rows: number;
  cursorRow: number;
  cursorColumn: number;
  style: TerminalStyleState;
  escapeBuffer: string | null;
  output: string;
  cells: TerminalCellState[][];
}

export interface CpuState {
  // Reducer state uses plain arrays so it can be mounted in Redux state without typed-array quirks.
  registers: number[];
  pc: number;
  ccr: number;
}

export interface MemoryState {
  bytes: Record<number, number>;
}

export interface InputState {
  queue: number[];
  waitingForInput: boolean;
  pendingInputTask?: number;
}

export interface ExecutionRuntimeState {
  halted: boolean;
  currentLine: number;
  lastInstruction: string;
  endPointer?: [number, number];
}

export interface DiagnosticsState {
  exception?: string;
  errors: string[];
}

export interface InterpreterHistoryFrame {
  cpu: CpuState;
  memory: MemoryState;
  terminal: TerminalState;
  input: InputState;
  execution: ExecutionRuntimeState;
  diagnostics: DiagnosticsState;
}

export interface HistoryState {
  undoFrames: InterpreterHistoryFrame[];
}

export interface InterpreterReducerState {
  program: LoadedProgramState;
  cpu: CpuState;
  memory: MemoryState;
  terminal: TerminalState;
  input: InputState;
  execution: ExecutionRuntimeState;
  diagnostics: DiagnosticsState;
  history: HistoryState;
}

export const DEFAULT_TERMINAL_COLUMNS = 80;
export const DEFAULT_TERMINAL_ROWS = 25;
export const DEFAULT_STACK_POINTER = 0x00100000;
export const DEFAULT_LAST_INSTRUCTION = 'Ready';
export const MAX_HISTORY_FRAMES = 256;

function cloneInstruction(
  instruction: InterpreterInstruction
): InterpreterInstruction {
  return [instruction[0], instruction[1], instruction[2]];
}

export function createLoadedProgramState(
  overrides: Partial<LoadedProgramState> = {}
): LoadedProgramState {
  return {
    source: overrides.source ?? '',
    instructions: overrides.instructions ? overrides.instructions.map(cloneInstruction) : [],
    sourceLines: overrides.sourceLines ? [...overrides.sourceLines] : [],
    codeLabels: overrides.codeLabels ? { ...overrides.codeLabels } : {},
    symbols: overrides.symbols ? { ...overrides.symbols } : {},
    symbolLookup: overrides.symbolLookup ? { ...overrides.symbolLookup } : {},
    memoryImage: overrides.memoryImage ? { ...overrides.memoryImage } : {},
    endPointer: overrides.endPointer ? [overrides.endPointer[0], overrides.endPointer[1]] : undefined,
    entryLabel: overrides.entryLabel,
    orgAddress: overrides.orgAddress,
  };
}

export function cloneLoadedProgramState(program: LoadedProgramState): LoadedProgramState {
  return createLoadedProgramState(program);
}

export function createTerminalStyleState(
  overrides: Partial<TerminalStyleState> = {}
): TerminalStyleState {
  return {
    foreground: overrides.foreground ?? null,
    background: overrides.background ?? null,
    bold: overrides.bold ?? false,
    inverse: overrides.inverse ?? false,
  };
}

export function createTerminalCellState(
  overrides: Partial<TerminalCellState> = {}
): TerminalCellState {
  const style = createTerminalStyleState(overrides);
  return {
    char: overrides.char ?? ' ',
    foreground: style.foreground,
    background: style.background,
    bold: style.bold,
    inverse: style.inverse,
  };
}

export function createEmptyTerminalState(
  columns = DEFAULT_TERMINAL_COLUMNS,
  rows = DEFAULT_TERMINAL_ROWS
): TerminalState {
  const style = createTerminalStyleState();
  return {
    columns,
    rows,
    cursorRow: 0,
    cursorColumn: 0,
    style,
    escapeBuffer: null,
    output: '',
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => createTerminalCellState(style))
    ),
  };
}

export function cloneTerminalState(terminal: TerminalState): TerminalState {
  return {
    columns: terminal.columns,
    rows: terminal.rows,
    cursorRow: terminal.cursorRow,
    cursorColumn: terminal.cursorColumn,
    style: createTerminalStyleState(terminal.style),
    escapeBuffer: terminal.escapeBuffer,
    output: terminal.output,
    cells: terminal.cells.map((row) => row.map((cell) => createTerminalCellState(cell))),
  };
}

export function createCpuState(overrides: Partial<CpuState> = {}): CpuState {
  const registers =
    overrides.registers !== undefined
      ? [...overrides.registers]
      : Array.from({ length: 16 }, (_, index) => (index === 7 ? DEFAULT_STACK_POINTER : 0));

  return {
    registers,
    pc: overrides.pc ?? 0,
    ccr: overrides.ccr ?? 0,
  };
}

export function cloneCpuState(cpu: CpuState): CpuState {
  return createCpuState(cpu);
}

export function createMemoryState(bytes: Record<number, number> = {}): MemoryState {
  return {
    bytes: { ...bytes },
  };
}

export function cloneMemoryState(memory: MemoryState): MemoryState {
  return createMemoryState(memory.bytes);
}

export function createInputState(overrides: Partial<InputState> = {}): InputState {
  return {
    queue: overrides.queue ? [...overrides.queue] : [],
    waitingForInput: overrides.waitingForInput ?? false,
    pendingInputTask: overrides.pendingInputTask,
  };
}

export function cloneInputState(input: InputState): InputState {
  return createInputState(input);
}

export function createExecutionRuntimeState(
  overrides: Partial<ExecutionRuntimeState> = {}
): ExecutionRuntimeState {
  return {
    halted: overrides.halted ?? false,
    currentLine: overrides.currentLine ?? 0,
    lastInstruction: overrides.lastInstruction ?? DEFAULT_LAST_INSTRUCTION,
    endPointer: overrides.endPointer ? [overrides.endPointer[0], overrides.endPointer[1]] : undefined,
  };
}

export function cloneExecutionRuntimeState(
  execution: ExecutionRuntimeState
): ExecutionRuntimeState {
  return createExecutionRuntimeState(execution);
}

export function createDiagnosticsState(
  overrides: Partial<DiagnosticsState> = {}
): DiagnosticsState {
  return {
    exception: overrides.exception,
    errors: overrides.errors ? [...overrides.errors] : [],
  };
}

export function cloneDiagnosticsState(diagnostics: DiagnosticsState): DiagnosticsState {
  return createDiagnosticsState(diagnostics);
}

export function createHistoryFrame(state: InterpreterReducerState): InterpreterHistoryFrame {
  return {
    cpu: cloneCpuState(state.cpu),
    memory: cloneMemoryState(state.memory),
    terminal: cloneTerminalState(state.terminal),
    input: cloneInputState(state.input),
    execution: cloneExecutionRuntimeState(state.execution),
    diagnostics: cloneDiagnosticsState(state.diagnostics),
  };
}

export function createHistoryState(
  overrides: Partial<HistoryState> = {}
): HistoryState {
  return {
    undoFrames: overrides.undoFrames
      ? overrides.undoFrames.map((frame) => ({
          cpu: cloneCpuState(frame.cpu),
          memory: cloneMemoryState(frame.memory),
          terminal: cloneTerminalState(frame.terminal),
          input: cloneInputState(frame.input),
          execution: cloneExecutionRuntimeState(frame.execution),
          diagnostics: cloneDiagnosticsState(frame.diagnostics),
        }))
      : [],
  };
}

export function cloneHistoryState(history: HistoryState): HistoryState {
  return createHistoryState(history);
}

export interface CreateInterpreterReducerStateOptions {
  program?: Partial<LoadedProgramState>;
  initialMemory?: Record<number, number>;
  columns?: number;
  rows?: number;
}

export function createInitialInterpreterReducerState(
  options: CreateInterpreterReducerStateOptions = {}
): InterpreterReducerState {
  const program = createLoadedProgramState(options.program);
  const initialMemory = options.initialMemory ?? program.memoryImage;

  return {
    program: {
      ...program,
      memoryImage: { ...initialMemory },
    },
    cpu: createCpuState(),
    memory: createMemoryState(initialMemory),
    terminal: createEmptyTerminalState(options.columns, options.rows),
    input: createInputState(),
    execution: createExecutionRuntimeState({
      endPointer: program.endPointer,
    }),
    diagnostics: createDiagnosticsState(),
    history: createHistoryState(),
  };
}
