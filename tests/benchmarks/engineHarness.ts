import { performance } from 'node:perf_hooks';
import { Emulator, type TerminalMeta } from '@m68k/interpreter';
import { ReducerInterpreterSession } from '@m68k/interpreter-redux';
import type {
  BenchmarkEngineId,
  BenchmarkScenario,
  BenchmarkScenarioExpectation,
} from './engineScenarios';

type RegisterName =
  | 'a0'
  | 'a1'
  | 'a2'
  | 'a3'
  | 'a4'
  | 'a5'
  | 'a6'
  | 'a7'
  | 'd0'
  | 'd1'
  | 'd2'
  | 'd3'
  | 'd4'
  | 'd5'
  | 'd6'
  | 'd7';

interface BenchmarkSession {
  emulationStep(): boolean;
  getCFlag(): number;
  getErrors(): string[];
  getException(): string | undefined;
  getLastInstruction(): string;
  getMemory(): Record<number, number>;
  getNFlag(): number;
  getPC(): number;
  getRegisters(): Int32Array;
  getSymbolAddress(symbol: string): number | undefined;
  getSymbols(): Record<string, number>;
  getTerminalMeta(): TerminalMeta;
  getTerminalText(): string;
  getVFlag(): number;
  getXFlag(): number;
  getZFlag(): number;
  isHalted(): boolean;
  isWaitingForInput(): boolean;
}

export interface EngineSnapshot {
  registers: number[];
  memory: Array<[number, number]>;
  pc: number;
  flags: {
    z: number;
    v: number;
    n: number;
    c: number;
    x: number;
  };
  terminalMeta: TerminalMeta;
  terminalText: string;
  lastInstruction: string;
  errors: string[];
  exception?: string;
  halted: boolean;
  waitingForInput: boolean;
  symbols: Array<[string, number]>;
}

export interface EngineRunMetrics {
  elapsedMs: number;
  steps: number;
  stepsPerSecond: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  userCpuMicros: number;
  systemCpuMicros: number;
}

export interface EngineRunResult {
  engine: BenchmarkEngineId;
  scenarioId: string;
  metrics: EngineRunMetrics;
  snapshot: EngineSnapshot;
}

interface NumericSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface EngineProfileSummary {
  elapsedMs: NumericSummary;
  stepsPerSecond: NumericSummary;
  heapDeltaBytes: NumericSummary;
  rssDeltaBytes: NumericSummary;
  userCpuMicros: NumericSummary;
  systemCpuMicros: NumericSummary;
  steps: number;
  sampleCount: number;
  finalSnapshot: EngineSnapshot;
}

export interface ScenarioProfileReport {
  scenario: BenchmarkScenario;
  interpreter: EngineProfileSummary;
  interpreterRedux: EngineProfileSummary;
  elapsedRatio: number;
  throughputRatio: number;
}

export interface EngineBatteryProfileReport {
  generatedAt: string;
  warmupRuns: number;
  measuredRuns: number;
  scenarios: ScenarioProfileReport[];
}

const REGISTER_INDEX_BY_NAME: Record<RegisterName, number> = {
  a0: 0,
  a1: 1,
  a2: 2,
  a3: 3,
  a4: 4,
  a5: 5,
  a6: 6,
  a7: 7,
  d0: 8,
  d1: 9,
  d2: 10,
  d3: 11,
  d4: 12,
  d5: 13,
  d6: 14,
  d7: 15,
};

function createSession(engine: BenchmarkEngineId, program: string): BenchmarkSession {
  if (engine === 'interpreter') {
    return new Emulator(program);
  }

  return new ReducerInterpreterSession(program);
}

function maybeRunGarbageCollection(): void {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function readMemoryByte(memory: Record<number, number>, address: number): number {
  return memory[address] ?? 0;
}

function readMemoryLong(memory: Record<number, number>, address: number): number {
  return (
    ((readMemoryByte(memory, address) & 0xff) << 24) |
    ((readMemoryByte(memory, address + 1) & 0xff) << 16) |
    ((readMemoryByte(memory, address + 2) & 0xff) << 8) |
    (readMemoryByte(memory, address + 3) & 0xff)
  ) >>> 0;
}

function toSortedNumericEntries(record: Record<number, number>): Array<[number, number]> {
  return Object.entries(record)
    .map(([address, value]) => [Number(address), value] as [number, number])
    .sort((left, right) => left[0] - right[0]);
}

function toSortedSymbolEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function collectSnapshot(session: BenchmarkSession): EngineSnapshot {
  return {
    registers: Array.from(session.getRegisters()),
    memory: toSortedNumericEntries(session.getMemory()),
    pc: session.getPC(),
    flags: {
      z: session.getZFlag(),
      v: session.getVFlag(),
      n: session.getNFlag(),
      c: session.getCFlag(),
      x: session.getXFlag(),
    },
    terminalMeta: session.getTerminalMeta(),
    terminalText: session.getTerminalText(),
    lastInstruction: session.getLastInstruction(),
    errors: [...session.getErrors()],
    exception: session.getException(),
    halted: session.isHalted(),
    waitingForInput: session.isWaitingForInput(),
    symbols: toSortedSymbolEntries(session.getSymbols()),
  };
}

function assertScenarioExpectations(
  expectation: BenchmarkScenarioExpectation | undefined,
  session: BenchmarkSession
): void {
  if (expectation === undefined) {
    return;
  }

  if (expectation.registers !== undefined) {
    const registers = session.getRegisters();
    for (const [registerName, expectedValue] of Object.entries(expectation.registers)) {
      const index = REGISTER_INDEX_BY_NAME[registerName as RegisterName];
      if (index === undefined) {
        throw new Error(`Unknown register expectation: ${registerName}`);
      }

      if (registers[index] !== expectedValue) {
        throw new Error(
          `Register ${registerName} expected ${expectedValue} but found ${registers[index]}`
        );
      }
    }
  }

  if (expectation.symbols !== undefined) {
    const memory = session.getMemory();
    for (const [symbolName, expectedValue] of Object.entries(expectation.symbols)) {
      const symbolAddress = session.getSymbolAddress(symbolName);
      if (symbolAddress === undefined) {
        throw new Error(`Expected symbol ${symbolName} to resolve in program memory`);
      }

      const actualValue = readMemoryLong(memory, symbolAddress);
      if (actualValue !== (expectedValue >>> 0)) {
        throw new Error(
          `Symbol ${symbolName} expected ${expectedValue >>> 0} but found ${actualValue}`
        );
      }
    }
  }
}

function assertScenarioTerminalMarkers(
  scenario: BenchmarkScenario,
  session: BenchmarkSession
): void {
  if (scenario.terminalMarkers === undefined || scenario.terminalMarkers.length === 0) {
    return;
  }

  const renderedText = session.getTerminalText();
  for (const marker of scenario.terminalMarkers) {
    if (!renderedText.includes(marker)) {
      throw new Error(`Scenario ${scenario.id} expected terminal to include "${marker}"`);
    }
  }
}

function runScenarioUntilStop(
  session: BenchmarkSession,
  scenario: BenchmarkScenario
): { steps: number; stopped: boolean } {
  if (scenario.mode === 'load-only') {
    return {
      steps: 0,
      stopped: true,
    };
  }

  let steps = 0;
  for (; steps < scenario.maxSteps; steps += 1) {
    const shouldStop = session.emulationStep();
    if (scenario.stopCondition === 'waiting-for-input' && session.isWaitingForInput()) {
      return {
        steps: steps + 1,
        stopped: true,
      };
    }

    if (shouldStop) {
      return {
        steps: steps + 1,
        stopped: true,
      };
    }
  }

  return {
    steps,
    stopped: false,
  };
}

export function runBenchmarkScenario(
  engine: BenchmarkEngineId,
  scenario: BenchmarkScenario
): EngineRunResult {
  maybeRunGarbageCollection();

  const beforeUsage = process.memoryUsage();
  const beforeResources = process.resourceUsage();
  const startedAt = performance.now();

  const session = createSession(engine, scenario.program);
  const { steps, stopped } = runScenarioUntilStop(session, scenario);

  const elapsedMs = performance.now() - startedAt;
  const afterUsage = process.memoryUsage();
  const afterResources = process.resourceUsage();

  if (!stopped) {
    throw new Error(
      `Scenario ${scenario.id} exceeded step budget (${scenario.maxSteps}) on ${engine}`
    );
  }

  if (session.getException() !== undefined) {
    throw new Error(
      `Scenario ${scenario.id} raised exception on ${engine}: ${session.getException()}`
    );
  }

  if (session.getErrors().length > 0) {
    throw new Error(
      `Scenario ${scenario.id} produced errors on ${engine}: ${session.getErrors().join(', ')}`
    );
  }

  assertScenarioExpectations(scenario.expectation, session);
  assertScenarioTerminalMarkers(scenario, session);

  return {
    engine,
    scenarioId: scenario.id,
    metrics: {
      elapsedMs,
      steps,
      stepsPerSecond: elapsedMs > 0 ? (steps / elapsedMs) * 1000 : 0,
      heapDeltaBytes: afterUsage.heapUsed - beforeUsage.heapUsed,
      rssDeltaBytes: afterUsage.rss - beforeUsage.rss,
      userCpuMicros: afterResources.userCPUTime - beforeResources.userCPUTime,
      systemCpuMicros: afterResources.systemCPUTime - beforeResources.systemCPUTime,
    },
    snapshot: collectSnapshot(session),
  };
}

function summarizeNumbers(values: number[]): NumericSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean,
    median,
  };
}

function summarizeRuns(runs: EngineRunResult[]): EngineProfileSummary {
  if (runs.length === 0) {
    throw new Error('Cannot summarize zero benchmark runs');
  }

  return {
    elapsedMs: summarizeNumbers(runs.map((run) => run.metrics.elapsedMs)),
    stepsPerSecond: summarizeNumbers(runs.map((run) => run.metrics.stepsPerSecond)),
    heapDeltaBytes: summarizeNumbers(runs.map((run) => run.metrics.heapDeltaBytes)),
    rssDeltaBytes: summarizeNumbers(runs.map((run) => run.metrics.rssDeltaBytes)),
    userCpuMicros: summarizeNumbers(runs.map((run) => run.metrics.userCpuMicros)),
    systemCpuMicros: summarizeNumbers(runs.map((run) => run.metrics.systemCpuMicros)),
    steps: runs[0].metrics.steps,
    sampleCount: runs.length,
    finalSnapshot: runs[0].snapshot,
  };
}

export function validateScenarioParity(scenario: BenchmarkScenario): {
  interpreter: EngineRunResult;
  interpreterRedux: EngineRunResult;
} {
  const interpreterRun = runBenchmarkScenario('interpreter', scenario);
  const reducerRun = runBenchmarkScenario('interpreter-redux', scenario);

  if (JSON.stringify(interpreterRun.snapshot) !== JSON.stringify(reducerRun.snapshot)) {
    throw new Error(
      `Scenario ${scenario.id} completed with mismatched final state between interpreter engines`
    );
  }

  return {
    interpreter: interpreterRun,
    interpreterRedux: reducerRun,
  };
}

export function profileScenarioPair(
  scenario: BenchmarkScenario,
  options: {
    warmupRuns?: number;
    measuredRuns?: number;
  } = {}
): ScenarioProfileReport {
  const warmupRuns = options.warmupRuns ?? 1;
  const measuredRuns = options.measuredRuns ?? 5;

  validateScenarioParity(scenario);

  for (let index = 0; index < warmupRuns; index += 1) {
    runBenchmarkScenario('interpreter', scenario);
    runBenchmarkScenario('interpreter-redux', scenario);
  }

  const interpreterRuns: EngineRunResult[] = [];
  const reducerRuns: EngineRunResult[] = [];

  for (let index = 0; index < measuredRuns; index += 1) {
    interpreterRuns.push(runBenchmarkScenario('interpreter', scenario));
    reducerRuns.push(runBenchmarkScenario('interpreter-redux', scenario));
  }

  const interpreter = summarizeRuns(interpreterRuns);
  const interpreterRedux = summarizeRuns(reducerRuns);

  if (JSON.stringify(interpreter.finalSnapshot) !== JSON.stringify(interpreterRedux.finalSnapshot)) {
    throw new Error(
      `Scenario ${scenario.id} produced divergent final state during profiling runs`
    );
  }

  return {
    scenario,
    interpreter,
    interpreterRedux,
    elapsedRatio:
      interpreter.elapsedMs.median > 0
        ? interpreterRedux.elapsedMs.median / interpreter.elapsedMs.median
        : 0,
    throughputRatio:
      interpreter.stepsPerSecond.median > 0
        ? interpreterRedux.stepsPerSecond.median / interpreter.stepsPerSecond.median
        : 0,
  };
}

export function profileEngineBattery(
  scenarios: BenchmarkScenario[],
  options: {
    warmupRuns?: number;
    measuredRuns?: number;
  } = {}
): EngineBatteryProfileReport {
  const warmupRuns = options.warmupRuns ?? 1;
  const measuredRuns = options.measuredRuns ?? 5;

  return {
    generatedAt: new Date().toISOString(),
    warmupRuns,
    measuredRuns,
    scenarios: scenarios.map((scenario) =>
      profileScenarioPair(scenario, {
        warmupRuns,
        measuredRuns,
      })
    ),
  };
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

export function formatEngineBatteryRows(
  report: EngineBatteryProfileReport
): Array<Record<string, number | string>> {
  return report.scenarios.map((scenarioReport) => ({
    scenario: scenarioReport.scenario.id,
    'interp median ms': roundMetric(scenarioReport.interpreter.elapsedMs.median),
    'redux median ms': roundMetric(scenarioReport.interpreterRedux.elapsedMs.median),
    'redux/interp ms': roundMetric(scenarioReport.elapsedRatio),
    'interp steps/s': roundMetric(scenarioReport.interpreter.stepsPerSecond.median),
    'redux steps/s': roundMetric(scenarioReport.interpreterRedux.stepsPerSecond.median),
    'redux/interp steps/s': roundMetric(scenarioReport.throughputRatio),
    'interp heap KB': roundMetric(scenarioReport.interpreter.heapDeltaBytes.median / 1024),
    'redux heap KB': roundMetric(scenarioReport.interpreterRedux.heapDeltaBytes.median / 1024),
  }));
}
