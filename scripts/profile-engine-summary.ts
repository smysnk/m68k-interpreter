import { formatEngineBatteryRows, profileEngineBattery, profileScenario } from '../tests/benchmarks/engineHarness';
import {
  ENGINE_BENCHMARK_SCENARIOS,
  NIBBLES_INTRO_BENCHMARK_SCENARIO,
} from '../tests/benchmarks/engineScenarios';

interface ProfileSummaryOptions {
  warmupRuns: number;
  measuredRuns: number;
  json: boolean;
}

interface NibblesSummaryRow {
  scenario: string;
  classicInterpreterMs: number;
  classicInterpreterStepsPerSecond: number;
  classicInterpreterHeapKb: number;
  steps: number;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): ProfileSummaryOptions {
  const warmupIndex = argv.indexOf('--warmup');
  const runsIndex = argv.indexOf('--runs');

  return {
    warmupRuns: parseNonNegativeInteger(
      warmupIndex >= 0 ? argv[warmupIndex + 1] : undefined,
      1
    ),
    measuredRuns: parseNonNegativeInteger(
      runsIndex >= 0 ? argv[runsIndex + 1] : undefined,
      3
    ),
    json: argv.includes('--json'),
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function buildNibblesRow(
  warmupRuns: number,
  measuredRuns: number
): NibblesSummaryRow {
  const report = profileScenario(NIBBLES_INTRO_BENCHMARK_SCENARIO, {
    warmupRuns,
    measuredRuns,
  });

  return {
    scenario: report.scenario.id,
    classicInterpreterMs: round(report.interpreter.elapsedMs.median),
    classicInterpreterStepsPerSecond: round(report.interpreter.stepsPerSecond.median),
    classicInterpreterHeapKb: round(report.interpreter.heapDeltaBytes.median / 1024),
    steps: report.interpreter.steps,
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const battery = profileEngineBattery(ENGINE_BENCHMARK_SCENARIOS, {
    warmupRuns: options.warmupRuns,
    measuredRuns: options.measuredRuns,
  });
  const batteryRows = formatEngineBatteryRows(battery);
  const nibblesRow = buildNibblesRow(options.warmupRuns, options.measuredRuns);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          warmupRuns: options.warmupRuns,
          measuredRuns: options.measuredRuns,
          batteryRows,
          nibblesRow,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    `Classic interpreter benchmark summary (warmup=${options.warmupRuns}, runs=${options.measuredRuns})`
  );
  console.log('Core Battery');
  console.table(batteryRows);
  console.log('Nibbles Intro');
  console.table([nibblesRow]);
}

main();
