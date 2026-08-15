import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runBenchmarkScenario,
  summarizeNumbers,
  type EngineRunMetrics,
} from '../tests/benchmarks/engineHarness';
import { ENGINE_BENCHMARK_SCENARIOS } from '../tests/benchmarks/engineScenarios';

const DEFAULT_OUTPUT = '.test-results/m68000-conformance/final-performance.json';

function readIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function git(command: string): string {
  return execFileSync('git', command.split(' '), { encoding: 'utf8' }).trim();
}

function summarizeSamples(samples: EngineRunMetrics[]) {
  return {
    elapsedMs: summarizeNumbers(samples.map((sample) => sample.elapsedMs)),
    stepsPerSecond: summarizeNumbers(samples.map((sample) => sample.stepsPerSecond)),
    heapDeltaBytes: summarizeNumbers(samples.map((sample) => sample.heapDeltaBytes)),
    rssDeltaBytes: summarizeNumbers(samples.map((sample) => sample.rssDeltaBytes)),
    userCpuMicros: summarizeNumbers(samples.map((sample) => sample.userCpuMicros)),
    systemCpuMicros: summarizeNumbers(samples.map((sample) => sample.systemCpuMicros)),
  };
}

function main(): void {
  const outputPath = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  const warmupRuns = readIntegerEnv('M68000_PROFILE_WARMUP_RUNS', 10);
  const measuredRuns = readIntegerEnv('M68000_PROFILE_MEASURED_RUNS', 50);

  const scenarios = ENGINE_BENCHMARK_SCENARIOS.map((scenario) => {
    for (let index = 0; index < warmupRuns; index += 1) {
      runBenchmarkScenario('interpreter', scenario);
    }
    const samples = Array.from(
      { length: measuredRuns },
      () => runBenchmarkScenario('interpreter', scenario).metrics
    );
    return {
      id: scenario.id,
      title: scenario.title,
      cpuProfile: scenario.cpuProfile ?? 'easy68k',
      steps: samples[0]?.steps ?? 0,
      summary: summarizeSamples(samples),
      samples,
    };
  });

  const report = {
    id: 'mc68000-conformance-post-cutover',
    capturedAt: new Date().toISOString(),
    sourceCommit: git('rev-parse HEAD'),
    worktreeDirty: git('status --porcelain').length > 0,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      hostname: os.hostname(),
    },
    warmupRuns,
    measuredRuns,
    scenarios,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
}

main();
