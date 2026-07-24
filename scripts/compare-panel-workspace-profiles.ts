import fs from 'node:fs';
import path from 'node:path';

type RenderHotspot = { id: string; maxActualDurationMs: number };
type BrowserScenario = {
  id: string;
  title: string;
  introElapsedMs: number;
  gameplayElapsedMs: number;
  workerTransport: { commandsSent: number };
  topRenderHotspots: RenderHotspot[];
  panelWorkspace?: { maxReducerDurationMs: number };
};
type IdeProfile = { generatedAt: string; scenarios: BrowserScenario[] };
type EngineProfile = {
  generatedAt: string;
  batteryRows: Array<Record<string, string | number>>;
};
type DragPathProfile = {
  p95FrameIntervalMs: number;
  preDropLayoutCommitDelta?: number;
  preDropPersistenceWriteDelta?: number;
  dragStartDelta?: number;
  successfulDropDelta?: number;
  validDockDropDelta?: number;
  floatingDropDelta?: number;
  layoutCommitDelta: number;
  persistenceWriteDelta: number;
  workerCommandDelta: number;
  workerFrameDelta: number;
  maxReducerDurationMs: number;
};
type DragProfile = {
  generatedAt: string;
  dockedDrag: DragPathProfile & { explicitDockTargetAvailable?: boolean };
  floatingDrag: DragPathProfile & { floatingPanelCount?: number };
  telemetry?: { p95PreviewFrameIntervalMs: number };
};
type Gate = {
  id: string;
  category: 'deterministic' | 'controlled-timing';
  scenarioId: string;
  metric: string;
  baseline: number | null;
  candidate: number;
  limit: number;
  unit: string;
  deltaPercent: number | null;
  status: 'passed' | 'failed';
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function percentDelta(baseline: number, candidate: number): number | null {
  if (baseline === 0) return candidate === 0 ? 0 : null;
  return Math.round(((candidate - baseline) / baseline) * 10_000) / 100;
}

function relativeGate(
  id: string,
  category: Gate['category'],
  scenarioId: string,
  metric: string,
  baseline: number,
  candidate: number,
  unit: string,
  tolerance = 0.1,
  minimumLimit = 0,
): Gate {
  const limit = Math.max(minimumLimit, baseline * (1 + tolerance));
  return {
    id,
    category,
    scenarioId,
    metric,
    baseline,
    candidate,
    limit,
    unit,
    deltaPercent: percentDelta(baseline, candidate),
    status: candidate <= limit ? 'passed' : 'failed',
  };
}

function absoluteGate(
  id: string,
  category: Gate['category'],
  scenarioId: string,
  metric: string,
  candidate: number,
  limit: number,
  unit: string,
): Gate {
  return {
    id,
    category,
    scenarioId,
    metric,
    baseline: null,
    candidate,
    limit,
    unit,
    deltaPercent: null,
    status: candidate <= limit ? 'passed' : 'failed',
  };
}

function exactGate(
  id: string,
  scenarioId: string,
  metric: string,
  candidate: number,
  expected: number,
  unit = 'count',
): Gate {
  return {
    id,
    category: 'deterministic',
    scenarioId,
    metric,
    baseline: null,
    candidate,
    limit: expected,
    unit,
    deltaPercent: null,
    status: candidate === expected ? 'passed' : 'failed',
  };
}

function bodyCommit(scenario: BrowserScenario): number {
  const bodyId = scenario.id.includes('hardware') ? 'HardwarePanel' : 'Terminal';
  return scenario.topRenderHotspots.find((row) => row.id === bodyId)?.maxActualDurationMs ?? 0;
}

const baselineDir = path.resolve(arg('--baseline') ?? '.test-results/panel-workspace-profile/baseline');
const candidateDir = path.resolve(arg('--candidate') ?? '.test-results/panel-workspace-profile/final');
const outputPath = path.resolve(arg('--output') ?? path.join(candidateDir, 'comparison.json'));
const baselineIde = readJson<IdeProfile>(path.join(baselineDir, 'ide-runtime.json'));
const candidateIde = readJson<IdeProfile>(path.join(candidateDir, 'ide-runtime.json'));
const baselineEngine = readJson<EngineProfile>(path.join(baselineDir, 'engine.json'));
const candidateEngine = readJson<EngineProfile>(path.join(candidateDir, 'engine.json'));
const candidateDragPath = path.join(candidateDir, 'drag.json');
const candidateDrag = fs.existsSync(candidateDragPath) ? readJson<DragProfile>(candidateDragPath) : null;
const gates: Gate[] = [];

for (const candidate of candidateIde.scenarios) {
  const baseline = baselineIde.scenarios.find((scenario) => scenario.id === candidate.id);
  if (!baseline) throw new Error(`Missing baseline browser scenario: ${candidate.id}`);
  gates.push(
    relativeGate(`${candidate.id}:intro`, 'controlled-timing', candidate.id, 'intro_elapsed_ms', baseline.introElapsedMs, candidate.introElapsedMs, 'ms'),
    relativeGate(`${candidate.id}:gameplay`, 'controlled-timing', candidate.id, 'gameplay_elapsed_ms', baseline.gameplayElapsedMs, candidate.gameplayElapsedMs, 'ms'),
    relativeGate(`${candidate.id}:body-commit`, 'controlled-timing', candidate.id, 'panel_body_commit_max_ms', bodyCommit(baseline), bodyCommit(candidate), 'ms', 0.1, 16),
    relativeGate(`${candidate.id}:commands`, 'deterministic', candidate.id, 'worker_commands', baseline.workerTransport.commandsSent, candidate.workerTransport.commandsSent, 'count', 0),
  );
  if (candidate.panelWorkspace) {
    gates.push(absoluteGate(`${candidate.id}:reducer`, 'deterministic', candidate.id, 'panel_reducer_max_ms', candidate.panelWorkspace.maxReducerDurationMs, 16, 'ms'));
  }
}

for (const candidate of candidateEngine.batteryRows) {
  const scenarioId = String(candidate.scenario);
  const baseline = baselineEngine.batteryRows.find((row) => String(row.scenario) === scenarioId);
  if (!baseline) throw new Error(`Missing baseline engine scenario: ${scenarioId}`);
  gates.push(relativeGate(
    `${scenarioId}:engine`,
    'controlled-timing',
    scenarioId,
    'engine_elapsed_ms',
    Number(baseline['classic median ms']),
    Number(candidate['classic median ms']),
    'ms',
  ));
}

if (candidateDrag) {
  for (const [pathId, candidate] of [
    ['docked', candidateDrag.dockedDrag],
    ['floating', candidateDrag.floatingDrag],
  ] as const) {
    gates.push(
      absoluteGate(`panel-drag:${pathId}:p95-fps`, 'controlled-timing', `panel-drag-${pathId}`, 'preview_frame_p95_ms', candidate.p95FrameIntervalMs, 1000 / 55, 'ms'),
      exactGate(`panel-drag:${pathId}:pre-drop-commits`, `panel-drag-${pathId}`, 'pre_drop_layout_commits', candidate.preDropLayoutCommitDelta ?? -1, 0),
      exactGate(`panel-drag:${pathId}:pre-drop-persistence`, `panel-drag-${pathId}`, 'pre_drop_persistence_writes', candidate.preDropPersistenceWriteDelta ?? -1, 0),
      exactGate(`panel-drag:${pathId}:starts`, `panel-drag-${pathId}`, 'drag_starts', candidate.dragStartDelta ?? -1, 1),
      exactGate(`panel-drag:${pathId}:drops`, `panel-drag-${pathId}`, 'successful_drops', candidate.successfulDropDelta ?? -1, 1),
      exactGate(`panel-drag:${pathId}:layout-commit`, `panel-drag-${pathId}`, 'layout_commits', candidate.layoutCommitDelta, 1),
      absoluteGate(`panel-drag:${pathId}:persistence`, 'deterministic', `panel-drag-${pathId}`, 'persistence_writes', candidate.persistenceWriteDelta, 1, 'count'),
      exactGate(`panel-drag:${pathId}:worker-commands`, `panel-drag-${pathId}`, 'worker_commands', candidate.workerCommandDelta, 0),
      exactGate(`panel-drag:${pathId}:worker-frames`, `panel-drag-${pathId}`, 'worker_frames', candidate.workerFrameDelta, 0),
      absoluteGate(`panel-drag:${pathId}:reducer`, 'deterministic', `panel-drag-${pathId}`, 'panel_reducer_max_ms', candidate.maxReducerDurationMs, 16, 'ms'),
    );
  }
  gates.push(
    exactGate('panel-drag:docked:explicit-target', 'panel-drag-docked', 'explicit_target_available', candidateDrag.dockedDrag.explicitDockTargetAvailable ? 1 : 0, 1),
    exactGate('panel-drag:docked:valid-drop', 'panel-drag-docked', 'valid_dock_drops', candidateDrag.dockedDrag.validDockDropDelta ?? -1, 1),
    exactGate('panel-drag:floating:free-drop', 'panel-drag-floating', 'floating_drops', candidateDrag.floatingDrag.floatingDropDelta ?? -1, 1),
    exactGate('panel-drag:floating:remains-floating', 'panel-drag-floating', 'floating_panels', candidateDrag.floatingDrag.floatingPanelCount ?? -1, 1),
  );
  if (candidateDrag.telemetry) {
    gates.push(absoluteGate(
      'panel-drag:telemetry:p95-fps',
      'controlled-timing',
      'panel-drag-all',
      'telemetry_preview_frame_p95_ms',
      candidateDrag.telemetry.p95PreviewFrameIntervalMs,
      1000 / 55,
      'ms',
    ));
  }
}

const failed = gates.filter((gate) => gate.status === 'failed');
const result = {
  generatedAt: new Date().toISOString(),
  baseline: { directory: baselineDir, generatedAt: baselineIde.generatedAt },
  candidate: { directory: candidateDir, generatedAt: candidateIde.generatedAt },
  policy: {
    relativeRegressionBudgetPercent: 10,
    maxPanelReducerDurationMs: 16,
    maxPreviewFrameIntervalP95Ms: 1000 / 55,
    note: 'Timing gates are meaningful only on the same controlled runner. Existing browser and engine timings use the 10% relative budget; the new overlay interaction uses the absolute 55 FPS preview gate.',
  },
  status: failed.length === 0 ? 'passed' : 'failed',
  summary: { total: gates.length, passed: gates.length - failed.length, failed: failed.length },
  gates,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
