import { formatEngineBatteryRows, profileEngineBattery, profileScenario } from '../tests/benchmarks/engineHarness';
import {
  ENGINE_BENCHMARK_SCENARIOS,
  NIBBLES_INTRO_BENCHMARK_SCENARIO,
} from '../tests/benchmarks/engineScenarios';
import { Easy68kHardware } from '../packages/interpreter/src/devices/easy68kHardware';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

interface ProfileSummaryOptions {
  warmupRuns: number;
  measuredRuns: number;
  json: boolean;
  outputPath: string | null;
}

interface NibblesSummaryRow {
  scenario: string;
  classicInterpreterMs: number;
  classicInterpreterStepsPerSecond: number;
  classicInterpreterHeapKb: number;
  steps: number;
}

interface HardwareSummaryRow {
  scenario: string;
  operations: number;
  medianMs: number;
  operationsPerSecond: number;
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
  const outputIndex = argv.indexOf('--output');

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
    outputPath: outputIndex >= 0 ? argv[outputIndex + 1] ?? null : null,
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function profileHardwareScenario(
  scenario: string,
  operation: (hardware: Easy68kHardware, index: number) => void,
  warmupRuns: number,
  measuredRuns: number,
  operations = 100_000
): HardwareSummaryRow {
  const run = (): number => {
    const hardware = new Easy68kHardware();
    const startedAt = performance.now();
    for (let index = 0; index < operations; index += 1) {
      operation(hardware, index);
    }
    return performance.now() - startedAt;
  };
  for (let index = 0; index < warmupRuns; index += 1) {
    run();
  }
  const samples = Array.from({ length: measuredRuns }, run);
  const medianMs = median(samples);
  return {
    scenario,
    operations,
    medianMs: round(medianMs),
    operationsPerSecond: round((operations / medianMs) * 1000),
  };
}

function buildHardwareRows(warmupRuns: number, measuredRuns: number): HardwareSummaryRow[] {
  return [
    profileHardwareScenario(
      'hardware-unmapped-byte-control',
      (hardware, index) => {
        hardware.readByte(0x1000 + (index & 0xff));
      },
      warmupRuns,
      measuredRuns
    ),
    profileHardwareScenario(
      'hardware-mapped-switch-read',
      (hardware) => {
        hardware.readByte(0xe00010);
      },
      warmupRuns,
      measuredRuns
    ),
    profileHardwareScenario(
      'hardware-mapped-led-write',
      (hardware, index) => {
        hardware.writeByte(0xe00010, index);
      },
      warmupRuns,
      measuredRuns
    ),
    profileHardwareScenario(
      'hardware-display-write-burst',
      (hardware, index) => {
        hardware.writeByte(0xe00000 + ((index & 7) << 1), index);
      },
      warmupRuns,
      measuredRuns
    ),
    profileHardwareScenario(
      'hardware-mixed-mapped-unmapped',
      (hardware, index) => {
        if ((index & 1) === 0) {
          hardware.writeByte(0xe00010, index);
        } else {
          hardware.readByte(0x2000 + (index & 0xff));
        }
      },
      warmupRuns,
      measuredRuns
    ),
  ];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const battery = profileEngineBattery(ENGINE_BENCHMARK_SCENARIOS, {
    warmupRuns: options.warmupRuns,
    measuredRuns: options.measuredRuns,
  });
  const batteryRows = formatEngineBatteryRows(battery);
  const nibblesRow = buildNibblesRow(options.warmupRuns, options.measuredRuns);
  const hardwareRows = buildHardwareRows(options.warmupRuns, options.measuredRuns);

  if (options.json || options.outputPath) {
    const json = `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        warmupRuns: options.warmupRuns,
        measuredRuns: options.measuredRuns,
        batteryRows,
        nibblesRow,
        hardwareRows,
      },
      null,
      2
    )}\n`;
    if (options.outputPath) {
      const outputPath = path.resolve(options.outputPath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, json);
    }
    if (options.json) {
      process.stdout.write(json);
    }
    return;
  }

  console.log(
    `Classic interpreter benchmark summary (warmup=${options.warmupRuns}, runs=${options.measuredRuns})`
  );
  console.log('Core Battery');
  console.table(batteryRows);
  console.log('Nibbles Intro');
  console.table([nibblesRow]);
  console.log('EASy68K Hardware Device');
  console.table(hardwareRows);
}

main();
