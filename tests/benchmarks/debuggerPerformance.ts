import { performance } from 'node:perf_hooks';
import { Emulator, type DebuggerConfiguration } from '@m68k/interpreter';

export interface DebuggerPerformanceMetric {
  id: string;
  instructions: number;
  medianMs: number;
  p95Ms: number;
  instructionsPerSecond: number;
}

function percentile(samples: number[], fraction: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0;
}

function sourceProgram(instructionLines = 1_000): string {
  return [
    'ORG $1000',
    'START',
    ...Array.from({ length: instructionLines }, () => '  NOP'),
    '  BRA START',
    'END START',
  ].join('\n');
}

function configuration(count: number): DebuggerConfiguration {
  return {
    breakpoints: Array.from({ length: count }, (_, index) => ({
      id: `conditional-${index}`,
      enabled: true,
      kind: 'source' as const,
      fileId: 'benchmark.asm',
      line: index + 3,
      condition: 'D0 == -1',
    })),
    watches: [],
    watchpoints: [],
  };
}

function sample(configurationValue: DebuggerConfiguration, instructions: number): number {
  const emulator = new Emulator(sourceProgram(), {
    emulation: { cpuModel: 'm68000', machineProfile: 'bare' },
    debugFileId: 'benchmark.asm',
  });
  emulator.configureDebugger(configurationValue);
  emulator.beginDebugContinue();
  const startedAt = performance.now();
  for (let index = 0; index < instructions; index += 1) emulator.emulationStep();
  return performance.now() - startedAt;
}

export function profileDebuggerPerformance({
  instructions = 20_000,
  measuredRuns = 5,
}: {
  instructions?: number;
  measuredRuns?: number;
} = {}): DebuggerPerformanceMetric[] {
  const scenarios = [
    { id: 'zero-breakpoints', config: configuration(0) },
    { id: '100-conditional-misses', config: configuration(100) },
    { id: '1000-conditional-misses', config: configuration(1_000) },
    {
      id: 'write-watchpoint-observer-miss',
      config: {
        ...configuration(0),
        watchpoints: [
          {
            id: 'unmatched-write',
            enabled: true,
            address: 0x00f000,
            size: 1 as const,
            access: 'write' as const,
          },
        ],
      },
    },
  ];
  const metrics: DebuggerPerformanceMetric[] = [];
  for (const scenario of scenarios) {
    sample(scenario.config, Math.min(2_000, instructions));
    const samples = Array.from({ length: measuredRuns }, () =>
      sample(scenario.config, instructions)
    );
    const medianMs = percentile(samples, 0.5);
    metrics.push({
      id: scenario.id,
      instructions,
      medianMs,
      p95Ms: percentile(samples, 0.95),
      instructionsPerSecond: instructions / (medianMs / 1_000),
    });
  }
  return metrics;
}
