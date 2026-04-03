import { performance } from 'node:perf_hooks';
import { ENGINE_BENCHMARK_SCENARIOS } from './engineScenarios';
import { profileEngineBattery } from './engineHarness';
import {
  createEngineBenchmarkSuitePayload,
  createFailedSuitePayload,
  emitStructuredSuitePayload,
  formatSuiteConsoleHeading,
  resolveRunnerKey,
} from './testStationMetrics';

const SUITE_LABEL = 'Classic Interpreter Benchmark Battery';

function readIntegerEnv(name: string, fallback: number): number {
  const rawValue = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : fallback;
}

async function main(): Promise<void> {
  const startedAt = performance.now();

  try {
    const warmupRuns = readIntegerEnv('TEST_STATION_BENCHMARK_WARMUP_RUNS', 1);
    const measuredRuns = readIntegerEnv('TEST_STATION_BENCHMARK_MEASURED_RUNS', 5);
    const report = profileEngineBattery(ENGINE_BENCHMARK_SCENARIOS, {
      warmupRuns,
      measuredRuns,
    });

    console.error(formatSuiteConsoleHeading(SUITE_LABEL));
    for (const scenario of report.scenarios) {
      console.error(
        `${scenario.scenario.id}: interpreter=${scenario.interpreter.elapsedMs.median.toFixed(2)}ms`
      );
    }

    emitStructuredSuitePayload(
      createEngineBenchmarkSuitePayload({
        suiteLabel: SUITE_LABEL,
        report,
        durationMs: performance.now() - startedAt,
        runnerKey: resolveRunnerKey(),
        artifactBaseName: 'engine-battery',
      })
    );
  } catch (error) {
    emitStructuredSuitePayload(
      createFailedSuitePayload({
        suiteLabel: SUITE_LABEL,
        durationMs: performance.now() - startedAt,
        error,
      })
    );
  }
}

void main();
