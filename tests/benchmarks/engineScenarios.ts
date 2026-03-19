import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProgramSource } from '@m68k/interpreter';

export type BenchmarkEngineId = 'interpreter' | 'interpreter-redux';

export type BenchmarkScenarioMode = 'load-only' | 'load-and-run';
export type BenchmarkStopCondition = 'halt-or-stop' | 'waiting-for-input';

export interface BenchmarkScenarioExpectation {
  registers?: Record<string, number>;
  symbols?: Record<string, number>;
}

export interface BenchmarkScenario {
  id: string;
  title: string;
  description: string;
  program: ProgramSource;
  mode: BenchmarkScenarioMode;
  maxSteps: number;
  stopCondition?: BenchmarkStopCondition;
  terminalMarkers?: string[];
  expectation?: BenchmarkScenarioExpectation;
}

const nibblesPath = fileURLToPath(new URL('../../examples/nibbles.asm', import.meta.url));
const nibblesProgram = new Uint8Array(readFileSync(nibblesPath));

export const NIBBLES_INTRO_BENCHMARK_SCENARIO: BenchmarkScenario = {
  id: 'nibbles-intro-screen',
  title: 'Nibbles Intro Screen',
  description: 'Measures how long each engine takes to boot nibbles.asm and render the intro/menu screen.',
  program: nibblesProgram,
  mode: 'load-and-run',
  maxSteps: 200000,
  stopCondition: 'waiting-for-input',
  terminalMarkers: ['Difficulty', 'Programmed By Josh Henn'],
};

function buildColdLoadProgram(entryCount = 96): string {
  const declarations = Array.from({ length: entryCount }, (_, index) => {
    const hexValue = (0x1000 + index).toString(16).toUpperCase().padStart(4, '0');
    return `VALUE_${index.toString().padStart(3, '0')} DC.L $${hexValue}`;
  }).join('\n');

  return `${declarations}
START
  MOVE.L VALUE_000,D0
  ADD.L VALUE_001,D0
  ADD.L VALUE_002,D0
  MOVE.L D0,VALUE_003
  END START`;
}

function buildTightArithmeticLoopProgram(loopCount = 100): string {
  return `ACC DC.L 0
ITER DC.L 0
START
  MOVE.L #0,D0
  MOVE.L #0,D1
  MOVE.L #${loopCount},D2
LOOP
  ADDQ.L #1,D0
  ADDI.L #3,D1
  SUBQ.L #1,D2
  BNE LOOP
  MOVE.L D0,ITER
  MOVE.L D1,ACC
  END START`;
}

function buildBranchPressureProgram(stopAt = 120, hitAt = 60): string {
  return `RESULT DC.L 0
COUNTER DC.L 0
START
  MOVE.L #${stopAt},D0
  CLR.L D1
LOOP
  SUBQ.L #1,D0
  CMPI.L #${hitAt},D0
  BEQ HIT
  TST.L D0
  BNE LOOP
  BRA DONE
HIT
  ADDQ.L #1,D1
  TST.L D0
  BNE LOOP
DONE
  MOVE.L D0,COUNTER
  MOVE.L D1,RESULT
  END START`;
}

function buildMemoryRoundTripProgram(slotCount = 16): string {
  const declarations = Array.from({ length: slotCount }, (_, index) => {
    return `SLOT_${index.toString().padStart(3, '0')} DC.L 0`;
  }).join('\n');

  const body = Array.from({ length: slotCount }, (_, index) => {
    const slot = `SLOT_${index.toString().padStart(3, '0')}`;
    const value = index + 1;
    return [
      `  MOVE.L #${value},D0`,
      `  MOVE.L D0,${slot}`,
      `  MOVE.L ${slot},D1`,
      '  ADD.L D1,D2',
    ].join('\n');
  }).join('\n');

  return `${declarations}
TOTAL DC.L 0
START
  CLR.L D2
${body}
  MOVE.L D2,TOTAL
  END START`;
}

export const ENGINE_BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    id: 'cold-load-generated-source',
    title: 'Cold Load Generated Source',
    description: 'Measures parser and loader setup cost on a generated medium-size assembly source.',
    program: buildColdLoadProgram(),
    mode: 'load-only',
    maxSteps: 0,
  },
  {
    id: 'tight-arithmetic-loop',
    title: 'Tight Arithmetic Loop',
    description: 'Exercises hot-path arithmetic, compare, and backward branch stepping.',
    program: buildTightArithmeticLoopProgram(),
    mode: 'load-and-run',
    maxSteps: 5000,
    expectation: {
      registers: {
        d0: 100,
        d1: 300,
      },
      symbols: {
        ITER: 100,
        ACC: 300,
      },
    },
  },
  {
    id: 'branch-pressure-loop',
    title: 'Branch Pressure Loop',
    description: 'Exercises repeated compare and branch decisions on the shared branch subset.',
    program: buildBranchPressureProgram(),
    mode: 'load-and-run',
    maxSteps: 6000,
    expectation: {
      registers: {
        d0: 0,
        d1: 1,
      },
      symbols: {
        COUNTER: 0,
        RESULT: 1,
      },
    },
  },
  {
    id: 'memory-roundtrip-unrolled',
    title: 'Memory Roundtrip Unrolled',
    description: 'Measures repeated register-to-memory and memory-to-register traffic on direct symbols.',
    program: buildMemoryRoundTripProgram(),
    mode: 'load-and-run',
    maxSteps: 2000,
    expectation: {
      registers: {
        d2: 136,
      },
      symbols: {
        TOTAL: 136,
      },
    },
  },
];

export const ENGINE_PROFILE_SMOKE_SCENARIOS: BenchmarkScenario[] = ENGINE_BENCHMARK_SCENARIOS.filter(
  (scenario) => scenario.id !== 'memory-roundtrip-unrolled' && scenario.id !== 'nibbles-intro-screen'
);
