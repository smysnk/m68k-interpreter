import os from 'node:os';
import type { EngineBatteryProfileReport, ScenarioProfileReport } from './engineHarness';

export interface StructuredSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface StructuredSuiteTest {
  name: string;
  fullName: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  assertions?: string[];
  failureMessages?: string[];
  module?: string;
  theme?: string;
  classificationSource?: string;
}

export interface StructuredRawArtifact {
  relativePath: string;
  label: string;
  content: string;
  mediaType: string;
}

export interface StructuredPerformanceStat {
  statGroup: string;
  statName: string;
  unit: string;
  numericValue: number;
  metadata?: Record<string, boolean | number | string | null>;
}

export interface StructuredSuitePayload {
  status: 'passed' | 'failed';
  durationMs: number;
  summary: StructuredSuiteSummary;
  warnings: string[];
  tests: StructuredSuiteTest[];
  rawArtifacts: StructuredRawArtifact[];
  performanceStats: StructuredPerformanceStat[];
}

export interface BrowserBenchmarkScenarioMetric {
  scenarioId: string;
  title: string;
  statGroup: string;
  elapsedMs: number;
  terminalRows: number;
  terminalColumns: number;
  terminalText: string;
  assertions: string[];
}

interface EngineSuiteOptions {
  suiteLabel: string;
  report: EngineBatteryProfileReport;
  durationMs: number;
  runnerKey: string;
  artifactBaseName: string;
}

interface BrowserSuiteOptions {
  suiteLabel: string;
  durationMs: number;
  runnerKey: string;
  browserName: string;
  seriesId: string;
  scenarioMetrics: BrowserBenchmarkScenarioMetric[];
  warnings?: string[];
}

const ENGINE_METRICS = [
  {
    statName: 'elapsed_ms',
    unit: 'ms',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.elapsedMs.median
        : report.interpreterRedux.elapsedMs.median,
  },
  {
    statName: 'steps_per_second',
    unit: 'ops_per_sec',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.stepsPerSecond.median
        : report.interpreterRedux.stepsPerSecond.median,
  },
  {
    statName: 'heap_delta_bytes',
    unit: 'bytes',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.heapDeltaBytes.median
        : report.interpreterRedux.heapDeltaBytes.median,
  },
  {
    statName: 'rss_delta_bytes',
    unit: 'bytes',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.rssDeltaBytes.median
        : report.interpreterRedux.rssDeltaBytes.median,
  },
  {
    statName: 'user_cpu_micros',
    unit: 'micros',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.userCpuMicros.median
        : report.interpreterRedux.userCpuMicros.median,
  },
  {
    statName: 'system_cpu_micros',
    unit: 'micros',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter'
        ? report.interpreter.systemCpuMicros.median
        : report.interpreterRedux.systemCpuMicros.median,
  },
  {
    statName: 'steps',
    unit: 'count',
    selectMedian: (report: ScenarioProfileReport, engineId: 'interpreter' | 'interpreter-redux') =>
      engineId === 'interpreter' ? report.interpreter.steps : report.interpreterRedux.steps,
  },
] as const;

function createEmptySummary(total: number): StructuredSuiteSummary {
  return {
    total,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
}

function slugToNamespaceSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function getScenarioStatGroup(scenarioId: string): string {
  if (scenarioId === 'nibbles-intro-screen') {
    return 'benchmark.node.engine.nibbles.intro';
  }

  return `benchmark.node.engine.shared.${slugToNamespaceSegment(scenarioId)}`;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function buildNodeMetadata(
  scenarioReport: ScenarioProfileReport,
  engineId: 'interpreter' | 'interpreter-redux',
  runnerKey: string,
  report: EngineBatteryProfileReport
): Record<string, boolean | number | string | null> {
  return {
    seriesId: engineId,
    engineId,
    scenarioId: scenarioReport.scenario.id,
    scenarioTitle: scenarioReport.scenario.title,
    statistic: 'median',
    runnerKey,
    runtime: 'node',
    harnessVersion: '1',
    warmupRuns: report.warmupRuns,
    measuredRuns: report.measuredRuns,
    sampleCount:
      engineId === 'interpreter'
        ? scenarioReport.interpreter.sampleCount
        : scenarioReport.interpreterRedux.sampleCount,
    parityVerified: true,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

function buildComparisonMetadata(
  scenarioReport: ScenarioProfileReport,
  runnerKey: string,
  report: EngineBatteryProfileReport
): Record<string, boolean | number | string | null> {
  return {
    seriesId: 'interpreter-redux-vs-interpreter',
    scenarioId: scenarioReport.scenario.id,
    scenarioTitle: scenarioReport.scenario.title,
    statistic: 'median',
    runnerKey,
    runtime: 'node',
    harnessVersion: '1',
    warmupRuns: report.warmupRuns,
    measuredRuns: report.measuredRuns,
    parityVerified: true,
    comparison: 'interpreter-redux/interpreter',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

function buildEnginePerformanceStats(
  scenarioReport: ScenarioProfileReport,
  report: EngineBatteryProfileReport,
  runnerKey: string
): StructuredPerformanceStat[] {
  const statGroup = getScenarioStatGroup(scenarioReport.scenario.id);
  const stats: StructuredPerformanceStat[] = [];

  for (const engineId of ['interpreter', 'interpreter-redux'] as const) {
    for (const metric of ENGINE_METRICS) {
      stats.push({
        statGroup,
        statName: metric.statName,
        unit: metric.unit,
        numericValue: roundMetric(metric.selectMedian(scenarioReport, engineId)),
        metadata: buildNodeMetadata(scenarioReport, engineId, runnerKey, report),
      });
    }
  }

  stats.push({
    statGroup,
    statName: 'elapsed_ratio_vs_interpreter',
    unit: 'ratio',
    numericValue: roundMetric(scenarioReport.elapsedRatio),
    metadata: buildComparisonMetadata(scenarioReport, runnerKey, report),
  });
  stats.push({
    statGroup,
    statName: 'throughput_ratio_vs_interpreter',
    unit: 'ratio',
    numericValue: roundMetric(scenarioReport.throughputRatio),
    metadata: buildComparisonMetadata(scenarioReport, runnerKey, report),
  });

  return stats;
}

function formatEngineScenarioSummary(report: ScenarioProfileReport): string {
  return [
    `${report.scenario.id}`,
    `  interpreter median ms: ${report.interpreter.elapsedMs.median.toFixed(2)}`,
    `  interpreter-redux median ms: ${report.interpreterRedux.elapsedMs.median.toFixed(2)}`,
    `  ratio (redux/interpreter): ${report.elapsedRatio.toFixed(2)}`,
    `  interpreter steps/s: ${report.interpreter.stepsPerSecond.median.toFixed(2)}`,
    `  interpreter-redux steps/s: ${report.interpreterRedux.stepsPerSecond.median.toFixed(2)}`,
    `  throughput ratio: ${report.throughputRatio.toFixed(2)}`,
  ].join('\n');
}

function formatEngineBatterySummary(report: EngineBatteryProfileReport): string {
  return [
    `generatedAt=${report.generatedAt}`,
    `warmupRuns=${report.warmupRuns}`,
    `measuredRuns=${report.measuredRuns}`,
    '',
    ...report.scenarios.map((scenarioReport) => formatEngineScenarioSummary(scenarioReport)),
  ].join('\n');
}

function createSerializableEngineReport(report: EngineBatteryProfileReport): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    warmupRuns: report.warmupRuns,
    measuredRuns: report.measuredRuns,
    scenarios: report.scenarios.map((scenarioReport) => ({
      scenario: {
        id: scenarioReport.scenario.id,
        title: scenarioReport.scenario.title,
        description: scenarioReport.scenario.description,
        mode: scenarioReport.scenario.mode,
        maxSteps: scenarioReport.scenario.maxSteps,
        stopCondition: scenarioReport.scenario.stopCondition ?? null,
      },
      interpreter: {
        elapsedMs: scenarioReport.interpreter.elapsedMs,
        stepsPerSecond: scenarioReport.interpreter.stepsPerSecond,
        heapDeltaBytes: scenarioReport.interpreter.heapDeltaBytes,
        rssDeltaBytes: scenarioReport.interpreter.rssDeltaBytes,
        userCpuMicros: scenarioReport.interpreter.userCpuMicros,
        systemCpuMicros: scenarioReport.interpreter.systemCpuMicros,
        steps: scenarioReport.interpreter.steps,
        sampleCount: scenarioReport.interpreter.sampleCount,
      },
      interpreterRedux: {
        elapsedMs: scenarioReport.interpreterRedux.elapsedMs,
        stepsPerSecond: scenarioReport.interpreterRedux.stepsPerSecond,
        heapDeltaBytes: scenarioReport.interpreterRedux.heapDeltaBytes,
        rssDeltaBytes: scenarioReport.interpreterRedux.rssDeltaBytes,
        userCpuMicros: scenarioReport.interpreterRedux.userCpuMicros,
        systemCpuMicros: scenarioReport.interpreterRedux.systemCpuMicros,
        steps: scenarioReport.interpreterRedux.steps,
        sampleCount: scenarioReport.interpreterRedux.sampleCount,
      },
      elapsedRatio: scenarioReport.elapsedRatio,
      throughputRatio: scenarioReport.throughputRatio,
    })),
  };
}

export function createEngineBenchmarkSuitePayload(options: EngineSuiteOptions): StructuredSuitePayload {
  const tests: StructuredSuiteTest[] = options.report.scenarios.map((scenarioReport) => ({
    name: scenarioReport.scenario.title,
    fullName: `${options.suiteLabel} ${scenarioReport.scenario.title}`,
    status: 'passed',
    durationMs: roundMetric(
      scenarioReport.interpreter.elapsedMs.median + scenarioReport.interpreterRedux.elapsedMs.median
    ),
    assertions: [
      'final-state parity preserved across interpreter engines',
      `emitted stable benchmark namespace ${getScenarioStatGroup(scenarioReport.scenario.id)}`,
      `measured ${options.report.measuredRuns} sample(s) with ${options.report.warmupRuns} warmup run(s)`,
    ],
    module: 'runtime',
    theme: 'benchmark',
    classificationSource: 'benchmark-harness',
  }));

  const summary = createEmptySummary(tests.length);
  summary.passed = tests.length;

  const performanceStats = options.report.scenarios.flatMap((scenarioReport) =>
    buildEnginePerformanceStats(scenarioReport, options.report, options.runnerKey)
  );

  const warnings: string[] = [];
  if (options.report.measuredRuns < 3) {
    warnings.push('benchmark sample count is below the recommended median target of 3 runs');
  }

  return {
    status: 'passed',
    durationMs: roundMetric(options.durationMs),
    summary,
    warnings,
    tests,
    rawArtifacts: [
      {
        relativePath: `benchmarks/${options.artifactBaseName}.json`,
        label: 'Engine benchmark report',
        content: `${JSON.stringify(createSerializableEngineReport(options.report), null, 2)}\n`,
        mediaType: 'application/json',
      },
      {
        relativePath: `benchmarks/${options.artifactBaseName}-summary.txt`,
        label: 'Engine benchmark summary',
        content: `${formatEngineBatterySummary(options.report)}\n`,
        mediaType: 'text/plain',
      },
    ],
    performanceStats,
  };
}

export function createBrowserBenchmarkSuitePayload(
  options: BrowserSuiteOptions
): StructuredSuitePayload {
  const tests: StructuredSuiteTest[] = options.scenarioMetrics.map((scenarioMetric) => ({
    name: scenarioMetric.title,
    fullName: `${options.suiteLabel} ${scenarioMetric.title}`,
    status: 'passed',
    durationMs: roundMetric(scenarioMetric.elapsedMs),
    assertions: scenarioMetric.assertions,
    module: 'experience',
    theme: 'benchmark',
    classificationSource: 'browser-benchmark',
  }));

  const summary = createEmptySummary(tests.length);
  summary.passed = tests.length;

  const performanceStats = options.scenarioMetrics.flatMap((scenarioMetric) => [
    {
      statGroup: scenarioMetric.statGroup,
      statName: 'elapsed_ms',
      unit: 'ms',
      numericValue: roundMetric(scenarioMetric.elapsedMs),
      metadata: {
        seriesId: options.seriesId,
        scenarioId: scenarioMetric.scenarioId,
        browserName: options.browserName,
        executionMode: 'headless',
        statistic: 'single',
        runnerKey: options.runnerKey,
        runtime: 'browser',
        harnessVersion: '1',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    },
    {
      statGroup: scenarioMetric.statGroup,
      statName: 'terminal_rows',
      unit: 'count',
      numericValue: scenarioMetric.terminalRows,
      metadata: {
        seriesId: options.seriesId,
        scenarioId: scenarioMetric.scenarioId,
        browserName: options.browserName,
        executionMode: 'headless',
        statistic: 'single',
        runnerKey: options.runnerKey,
        runtime: 'browser',
        harnessVersion: '1',
      },
    },
    {
      statGroup: scenarioMetric.statGroup,
      statName: 'terminal_columns',
      unit: 'count',
      numericValue: scenarioMetric.terminalColumns,
      metadata: {
        seriesId: options.seriesId,
        scenarioId: scenarioMetric.scenarioId,
        browserName: options.browserName,
        executionMode: 'headless',
        statistic: 'single',
        runnerKey: options.runnerKey,
        runtime: 'browser',
        harnessVersion: '1',
      },
    },
  ]);

  return {
    status: 'passed',
    durationMs: roundMetric(options.durationMs),
    summary,
    warnings: options.warnings ?? [],
    tests,
    rawArtifacts: [
      {
        relativePath: 'benchmarks/browser-nibbles-gameplay.json',
        label: 'Browser gameplay benchmark report',
        content: `${JSON.stringify(options.scenarioMetrics, null, 2)}\n`,
        mediaType: 'application/json',
      },
      ...options.scenarioMetrics.map((scenarioMetric) => ({
        relativePath: `benchmarks/${slugToNamespaceSegment(scenarioMetric.scenarioId)}-terminal.txt`,
        label: `${scenarioMetric.title} terminal text`,
        content: `${scenarioMetric.terminalText}\n`,
        mediaType: 'text/plain',
      })),
    ],
    performanceStats,
  };
}

export function createFailedSuitePayload(options: {
  suiteLabel: string;
  durationMs: number;
  error: unknown;
}): StructuredSuitePayload {
  const message =
    options.error instanceof Error ? options.error.stack || options.error.message : String(options.error);

  return {
    status: 'failed',
    durationMs: roundMetric(options.durationMs),
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    },
    warnings: [],
    tests: [
      {
        name: `${options.suiteLabel} failed`,
        fullName: `${options.suiteLabel} failed`,
        status: 'failed',
        durationMs: roundMetric(options.durationMs),
        failureMessages: [message],
        module: 'runtime',
        theme: 'benchmark',
        classificationSource: 'benchmark-harness',
      },
    ],
    rawArtifacts: [
      {
        relativePath: 'benchmarks/failure.txt',
        label: 'Benchmark failure',
        content: `${message}\n`,
        mediaType: 'text/plain',
      },
    ],
    performanceStats: [],
  };
}

export function emitStructuredSuitePayload(payload: StructuredSuitePayload): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function resolveRunnerKey(options: { browserName?: string } = {}): string {
  const override = String(process.env.TEST_STATION_BENCHMARK_RUNNER_KEY || '').trim();
  if (override) {
    return override;
  }

  const provider = process.env.GITHUB_ACTIONS ? 'gha' : 'local';
  const osLabel =
    String(process.env.TEST_STATION_RUNNER_OS_LABEL || '').trim() || normalizeOsLabel(process.platform);
  const nodeMajor = process.versions.node.split('.')[0] || 'unknown';
  const parts = [provider, osLabel, `node${nodeMajor}`];

  if (options.browserName) {
    parts.push(options.browserName);
  }

  return parts.join('-');
}

function normalizeOsLabel(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return platform;
  }
}

export function formatSuiteConsoleHeading(title: string): string {
  return `${title} | host=${os.hostname()} | node=${process.version} | runner=${resolveRunnerKey()}`;
}
