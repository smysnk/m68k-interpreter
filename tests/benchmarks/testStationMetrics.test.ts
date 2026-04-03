import { describe, expect, it } from 'vitest';
import { createEngineBenchmarkSuitePayload, resolveRunnerKey } from './testStationMetrics';
import type { EngineBatteryProfileReport } from './engineHarness';

const FAKE_ENGINE_REPORT: EngineBatteryProfileReport = {
  generatedAt: '2026-03-19T15:00:00.000Z',
  warmupRuns: 1,
  measuredRuns: 3,
  scenarios: [
    {
      scenario: {
        id: 'tight-arithmetic-loop',
        title: 'Tight Arithmetic Loop',
        description: 'fixture',
        program: 'END',
        mode: 'load-only',
        maxSteps: 0,
      },
      interpreter: {
        elapsedMs: { min: 1, max: 3, mean: 2, median: 2 },
        stepsPerSecond: { min: 10, max: 30, mean: 20, median: 20 },
        heapDeltaBytes: { min: 100, max: 300, mean: 200, median: 200 },
        rssDeltaBytes: { min: 1000, max: 3000, mean: 2000, median: 2000 },
        userCpuMicros: { min: 5, max: 7, mean: 6, median: 6 },
        systemCpuMicros: { min: 8, max: 10, mean: 9, median: 9 },
        steps: 100,
        sampleCount: 3,
        finalSnapshot: {
          registers: [],
          memory: [],
          pc: 0,
          flags: { z: 0, v: 0, n: 0, c: 0, x: 0 },
          terminalMeta: {
            rows: 25,
            columns: 80,
            cursorRow: 0,
            cursorColumn: 0,
            output: '',
            version: 1,
            geometryVersion: 1,
          },
          terminalText: '',
          lastInstruction: '',
          errors: [],
          halted: true,
          waitingForInput: false,
          symbols: [],
        },
      },
    },
  ],
};

describe('test station benchmark metrics', () => {
  it('creates stable benchmark namespaces and series metadata', () => {
    const payload = createEngineBenchmarkSuitePayload({
      suiteLabel: 'Classic Interpreter Benchmark Battery',
      report: FAKE_ENGINE_REPORT,
      durationMs: 25,
      runnerKey: 'gha-ubuntu-latest-node20',
      artifactBaseName: 'engine-battery',
    });

    expect(payload.status).toBe('passed');
    expect(payload.performanceStats).toHaveLength(7);
    expect(payload.performanceStats[0]).toMatchObject({
      statGroup: 'benchmark.node.classic_interpreter.shared.tight_arithmetic_loop',
      statName: 'elapsed_ms',
      unit: 'ms',
      metadata: {
        seriesId: 'classic-interpreter',
        runnerKey: 'gha-ubuntu-latest-node20',
        statistic: 'median',
      },
    });
    expect(payload.performanceStats.at(-1)).toMatchObject({
      statName: 'steps',
      metadata: {
        seriesId: 'classic-interpreter',
      },
    });
  });

  it('honors benchmark runner key overrides', () => {
    process.env.TEST_STATION_BENCHMARK_RUNNER_KEY = 'custom-runner-key';
    expect(resolveRunnerKey()).toBe('custom-runner-key');
    delete process.env.TEST_STATION_BENCHMARK_RUNNER_KEY;
  });
});
