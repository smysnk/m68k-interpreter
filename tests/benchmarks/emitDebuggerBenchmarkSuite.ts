import { performance } from 'node:perf_hooks';
import { profileDebuggerPerformance } from './debuggerPerformance';
import { emitStructuredSuitePayload, type StructuredSuitePayload } from './testStationMetrics';

const startedAt = performance.now();
const metrics = profileDebuggerPerformance({
  instructions: Number(process.env.TEST_STATION_DEBUGGER_INSTRUCTIONS ?? 20_000),
  measuredRuns: Number(process.env.TEST_STATION_BENCHMARK_MEASURED_RUNS ?? 5),
});
const payload: StructuredSuitePayload = {
  status: 'passed',
  durationMs: performance.now() - startedAt,
  summary: { total: metrics.length, passed: metrics.length, failed: 0, skipped: 0 },
  warnings: [],
  tests: metrics.map((metric) => ({
    name: metric.id,
    fullName: `Recursive Debugger Performance ${metric.id}`,
    status: 'passed',
    durationMs: metric.medianMs,
    assertions: [`measured ${metric.instructions} instruction boundaries`],
    module: 'debugger',
    theme: 'benchmark',
    classificationSource: 'debugger-performance-harness',
  })),
  performanceStats: metrics.flatMap((metric) => [
    {
      statGroup: `benchmark.node.debugger.${metric.id}`,
      statName: 'elapsed_ms',
      unit: 'ms',
      numericValue: metric.medianMs,
      metadata: { phase: process.env.DEBUGGER_PROFILE_PHASE ?? 'unspecified', statistic: 'median' },
    },
    {
      statGroup: `benchmark.node.debugger.${metric.id}`,
      statName: 'elapsed_ms_p95',
      unit: 'ms',
      numericValue: metric.p95Ms,
      metadata: { phase: process.env.DEBUGGER_PROFILE_PHASE ?? 'unspecified', statistic: 'p95' },
    },
    {
      statGroup: `benchmark.node.debugger.${metric.id}`,
      statName: 'instructions_per_second',
      unit: 'ops_per_sec',
      numericValue: metric.instructionsPerSecond,
      metadata: { phase: process.env.DEBUGGER_PROFILE_PHASE ?? 'unspecified', statistic: 'median' },
    },
  ]),
  rawArtifacts: [
    {
      relativePath: 'benchmarks/debugger-performance.json',
      label: 'Recursive debugger performance metrics',
      content: `${JSON.stringify(metrics, null, 2)}\n`,
      mediaType: 'application/json',
    },
  ],
};
emitStructuredSuitePayload(payload);
