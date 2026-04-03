import { performance } from 'node:perf_hooks';
import { profileScenario } from './engineHarness';
import { NIBBLES_INTRO_BENCHMARK_SCENARIO } from './engineScenarios';
import {
  createEngineBenchmarkSuitePayload,
  createFailedSuitePayload,
  emitStructuredSuitePayload,
  formatSuiteConsoleHeading,
  resolveRunnerKey,
} from './testStationMetrics';

const SUITE_LABEL = 'Classic Interpreter Nibbles Intro Benchmark';

function readIntegerEnv(name: string, fallback: number): number {
  const rawValue = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : fallback;
}

async function main(): Promise<void> {
  const startedAt = performance.now();

  try {
    const warmupRuns = readIntegerEnv('TEST_STATION_NIBBLES_INTRO_WARMUP_RUNS', 0);
    const measuredRuns = readIntegerEnv('TEST_STATION_NIBBLES_INTRO_MEASURED_RUNS', 3);
    const scenarioReport = profileScenario(NIBBLES_INTRO_BENCHMARK_SCENARIO, {
      warmupRuns,
      measuredRuns,
    });
    const report = {
      generatedAt: new Date().toISOString(),
      warmupRuns,
      measuredRuns,
      scenarios: [scenarioReport],
    };

    console.error(formatSuiteConsoleHeading(SUITE_LABEL));
    console.error(
      `${scenarioReport.scenario.id}: interpreter=${scenarioReport.interpreter.elapsedMs.median.toFixed(2)}ms`
    );

    emitStructuredSuitePayload(
      createEngineBenchmarkSuitePayload({
        suiteLabel: SUITE_LABEL,
        report,
        durationMs: performance.now() - startedAt,
        runnerKey: resolveRunnerKey(),
        artifactBaseName: 'nibbles-intro',
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
