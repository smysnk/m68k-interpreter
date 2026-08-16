import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ENGINE_BENCHMARK_SCENARIOS } from '../tests/benchmarks/engineScenarios';
import { profileEngineBattery } from '../tests/benchmarks/engineHarness';

const phase = process.argv[2] ?? 'final';
const outputDirectory = path.resolve(
  `.test-results/cpu-machine-profile-separation/${phase === 'final' ? 'final' : `checkpoints/${phase}`}`
);
const warmupRuns = Number.parseInt(process.env.PROFILE_WARMUPS ?? '10', 10);
const measuredRuns = Number.parseInt(process.env.PROFILE_RUNS ?? '50', 10);
fs.mkdirSync(outputDirectory, { recursive: true });

const report = profileEngineBattery(ENGINE_BENCHMARK_SCENARIOS, {
  warmupRuns,
  measuredRuns,
});
fs.writeFileSync(path.join(outputDirectory, 'engine.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  path.join(outputDirectory, 'environment.json'),
  `${JSON.stringify(
    {
      phase,
      generatedAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
      node: process.version,
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      warmupRuns,
      measuredRuns,
      environment: {
        PROFILE_WARMUPS: process.env.PROFILE_WARMUPS,
        PROFILE_RUNS: process.env.PROFILE_RUNS,
      },
    },
    null,
    2
  )}\n`
);
console.log(outputDirectory);
