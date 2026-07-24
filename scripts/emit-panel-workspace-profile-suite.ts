import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { StructuredPerformanceStat, StructuredSuitePayload } from '../tests/benchmarks/testStationMetrics';

type IdeProfile = {
  generatedAt: string;
  durationMs: number;
  scenarios: Array<{
    id: string;
    title: string;
    introElapsedMs: number;
    gameplayElapsedMs: number;
    workerTransport: { commandsSent: number; frameEventsReceived: number };
    terminalRepaint: { repaintCount: number; maxDurationMs: number };
    topRenderHotspots: Array<{ id: string; maxActualDurationMs: number }>;
  }>;
};

type ProfileComparison = {
  status: 'passed' | 'failed';
  summary: { total: number; passed: number; failed: number };
  gates: Array<{
    id: string;
    category: 'deterministic' | 'controlled-timing';
    scenarioId: string;
    metric: string;
    candidate: number;
    limit: number;
    unit: string;
    status: 'passed' | 'failed';
  }>;
};

type EngineProfile = {
  generatedAt: string;
  warmupRuns: number;
  measuredRuns: number;
  batteryRows: Array<Record<string, string | number>>;
  nibblesRow: Record<string, string | number>;
  hardwareRows: Array<Record<string, string | number>>;
};
type DragProfile = {
  generatedAt: string;
  dockedDrag: Record<string, string | number | boolean>;
  floatingDrag: Record<string, string | number | boolean>;
  telemetry?: Record<string, number>;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputDir = path.resolve(arg('--input') ?? process.env.PANEL_WORKSPACE_PROFILE_DIR ?? '.test-results/panel-workspace-profile/baseline');
const outputPath = arg('--output');
const phase = arg('--phase') ?? process.env.PANEL_WORKSPACE_PROFILE_PHASE ?? 'baseline';
const comparisonPath = arg('--comparison') ?? process.env.PANEL_WORKSPACE_COMPARISON_PATH;
const ide = JSON.parse(fs.readFileSync(path.join(inputDir, 'ide-runtime.json'), 'utf8')) as IdeProfile;
const engine = JSON.parse(fs.readFileSync(path.join(inputDir, 'engine.json'), 'utf8')) as EngineProfile;
const dragPath = path.join(inputDir, 'drag.json');
const drag = fs.existsSync(dragPath)
  ? JSON.parse(fs.readFileSync(dragPath, 'utf8')) as DragProfile
  : null;
const comparison = comparisonPath ? JSON.parse(fs.readFileSync(path.resolve(comparisonPath), 'utf8')) as ProfileComparison : null;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runnerKey = `${os.hostname()}-${process.platform}-${process.arch}`;
const metadata = { phase, commit, runnerKey, nodeVersion: process.version, platform: process.platform, arch: process.arch, harnessVersion: '1' };
const performanceStats: StructuredPerformanceStat[] = [];

for (const scenario of ide.scenarios) {
  const statGroup = `benchmark.browser.panel_workspace.${scenario.id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
  for (const [statName, numericValue, unit] of [
    ['intro_elapsed_ms', scenario.introElapsedMs, 'ms'],
    ['gameplay_elapsed_ms', scenario.gameplayElapsedMs, 'ms'],
    ['worker_commands', scenario.workerTransport.commandsSent, 'count'],
    ['worker_frames', scenario.workerTransport.frameEventsReceived, 'count'],
    ['terminal_repaints', scenario.terminalRepaint.repaintCount, 'count'],
    ['terminal_repaint_max_ms', scenario.terminalRepaint.maxDurationMs, 'ms'],
    ['react_commit_max_ms', Math.max(0, ...scenario.topRenderHotspots.map((row) => row.maxActualDurationMs)), 'ms'],
  ] as const) performanceStats.push({ statGroup, statName, unit, numericValue, metadata: { ...metadata, scenarioId: scenario.id } });
}

for (const row of engine.batteryRows) {
  const scenario = String(row.scenario);
  performanceStats.push(
    { statGroup: `benchmark.node.panel_workspace.${scenario}`, statName: 'elapsed_ms', unit: 'ms', numericValue: Number(row['classic median ms']), metadata: { ...metadata, scenarioId: scenario, warmupRuns: engine.warmupRuns, measuredRuns: engine.measuredRuns } },
    { statGroup: `benchmark.node.panel_workspace.${scenario}`, statName: 'steps_per_second', unit: 'ops_per_sec', numericValue: Number(row['classic steps/s']), metadata: { ...metadata, scenarioId: scenario, warmupRuns: engine.warmupRuns, measuredRuns: engine.measuredRuns } },
  );
}

if (drag) {
  for (const [pathId, profile] of [
    ['docked', drag.dockedDrag],
    ['floating', drag.floatingDrag],
  ] as const) {
    for (const [statName, sourceName, unit] of [
      ['elapsed_ms', 'elapsedMs', 'ms'],
      ['preview_frame_p95_ms', 'p95FrameIntervalMs', 'ms'],
      ['preview_frame_max_ms', 'maxFrameIntervalMs', 'ms'],
      ['layout_commits', 'layoutCommitDelta', 'count'],
      ['persistence_writes', 'persistenceWriteDelta', 'count'],
      ['worker_commands', 'workerCommandDelta', 'count'],
      ['worker_frames', 'workerFrameDelta', 'count'],
      ['panel_reducer_max_ms', 'maxReducerDurationMs', 'ms'],
    ] as const) {
      const numericValue = Number(profile[sourceName]);
      if (Number.isFinite(numericValue)) {
        performanceStats.push({
          statGroup: `benchmark.browser.panel_drag.${pathId}`,
          statName,
          unit,
          numericValue,
          metadata: { ...metadata, scenarioId: `panel-drag-${pathId}` },
        });
      }
    }
  }
}

const tests = ide.scenarios.map((scenario) => ({
  name: scenario.title,
  fullName: `Panel workspace ${phase} ${scenario.title}`,
  status: 'passed' as const,
  durationMs: scenario.introElapsedMs + scenario.gameplayElapsedMs,
  assertions: ['production browser profile completed', 'stable panel-workspace metric namespace emitted'],
  module: 'experience',
  theme: 'benchmark',
  classificationSource: 'panel-workspace-profiler',
}));
if (comparison) {
  tests.push(...comparison.gates.map((gate) => ({
    name: gate.id,
    fullName: `Panel workspace ${phase} ${gate.id}`,
    status: gate.status,
    durationMs: 0,
    assertions: [`${gate.metric}: ${gate.candidate}${gate.unit} <= ${gate.limit}${gate.unit}`],
    module: 'experience',
    theme: gate.category === 'deterministic' ? 'regression' : 'benchmark',
    classificationSource: 'panel-workspace-profile-comparison',
  })));
}
const failedTests = tests.filter((test) => test.status === 'failed').length;
const environment = { generatedAt: new Date().toISOString(), phase, commit, runnerKey, hostname: os.hostname(), platform: process.platform, release: os.release(), arch: process.arch, cpus: os.cpus().length, nodeVersion: process.version, warmupRuns: engine.warmupRuns, measuredRuns: engine.measuredRuns };
fs.writeFileSync(path.join(inputDir, 'environment.json'), `${JSON.stringify(environment, null, 2)}\n`);

const payload: StructuredSuitePayload = {
  status: failedTests === 0 ? 'passed' : 'failed',
  durationMs: ide.durationMs,
  summary: { total: tests.length, passed: tests.length - failedTests, failed: failedTests, skipped: 0 },
  warnings: phase === 'baseline'
    ? ['pre-refactor control measurement; compare subsequent phases on the same runner key']
    : comparison?.status === 'failed'
      ? [`${comparison.summary.failed} controlled comparison gate(s) exceeded budget`]
      : [],
  tests,
  rawArtifacts: [
    { relativePath: `benchmarks/panel-workspace-${phase}-ide-runtime.json`, label: `Panel workspace ${phase} browser profile`, content: `${JSON.stringify(ide, null, 2)}\n`, mediaType: 'application/json' },
    { relativePath: `benchmarks/panel-workspace-${phase}-engine.json`, label: `Panel workspace ${phase} engine profile`, content: `${JSON.stringify(engine, null, 2)}\n`, mediaType: 'application/json' },
    { relativePath: `benchmarks/panel-workspace-${phase}-environment.json`, label: `Panel workspace ${phase} environment`, content: `${JSON.stringify(environment, null, 2)}\n`, mediaType: 'application/json' },
    ...(drag ? [{ relativePath: `benchmarks/panel-workspace-${phase}-drag.json`, label: `Panel drag ${phase} profile`, content: `${JSON.stringify(drag, null, 2)}\n`, mediaType: 'application/json' }] : []),
    ...(comparison ? [{ relativePath: `benchmarks/panel-workspace-${phase}-comparison.json`, label: `Panel workspace ${phase} baseline comparison`, content: `${JSON.stringify(comparison, null, 2)}\n`, mediaType: 'application/json' }] : []),
  ],
  performanceStats,
};
const json = `${JSON.stringify(payload)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), json);
} else {
  process.stdout.write(json);
}
