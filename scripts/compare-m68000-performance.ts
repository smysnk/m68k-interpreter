import fs from 'node:fs';
import path from 'node:path';

interface Summary {
  median: number;
  mad: number;
}

interface ScenarioResult {
  id: string;
  summary: { elapsedMs: Summary };
}

interface PerformanceReport {
  id: string;
  sourceCommit: string;
  scenarios: ScenarioResult[];
}

const defaultBaseline = '.test-results/m68000-conformance/pre-refactor-baseline.json';
const defaultCandidate = '.test-results/m68000-conformance/final-performance.json';
const defaultOutput = '.test-results/m68000-conformance/performance-comparison.json';

function loadReport(filePath: string): PerformanceReport {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as PerformanceReport;
}

function percentDelta(baseline: number, candidate: number): number {
  return baseline === 0 ? 0 : ((candidate - baseline) / baseline) * 100;
}

function main(): void {
  const baselinePath = process.argv[2] ?? defaultBaseline;
  const candidatePath = process.argv[3] ?? defaultCandidate;
  const outputPath = path.resolve(process.argv[4] ?? defaultOutput);
  const baseline = loadReport(baselinePath);
  const candidate = loadReport(candidatePath);
  const candidateById = new Map(candidate.scenarios.map((scenario) => [scenario.id, scenario]));

  const scenarios = baseline.scenarios.map((baselineScenario) => {
    const candidateScenario = candidateById.get(baselineScenario.id);
    if (!candidateScenario) {
      return { id: baselineScenario.id, status: 'missing' as const };
    }
    const baselineMedian = baselineScenario.summary.elapsedMs.median;
    const candidateMedian = candidateScenario.summary.elapsedMs.median;
    const deltaPercent = percentDelta(baselineMedian, candidateMedian);
    const noisePercent = percentDelta(
      baselineMedian,
      baselineMedian + baselineScenario.summary.elapsedMs.mad * 2
    );
    const allowedRegressionPercent = Math.max(10, noisePercent);
    return {
      id: baselineScenario.id,
      status:
        deltaPercent <= allowedRegressionPercent ? ('passed' as const) : ('regressed' as const),
      baselineMedianMs: baselineMedian,
      candidateMedianMs: candidateMedian,
      deltaPercent,
      allowedRegressionPercent,
    };
  });
  const passed = scenarios.every((scenario) => scenario.status === 'passed');
  const comparison = {
    status: passed ? 'passed' : 'failed',
    baseline: { id: baseline.id, commit: baseline.sourceCommit, path: baselinePath },
    candidate: { id: candidate.id, commit: candidate.sourceCommit, path: candidatePath },
    policy: 'median elapsed time may not regress by more than 10% or two baseline MADs',
    scenarios,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`);
  console.table(scenarios);
  process.stdout.write(`${outputPath}\n`);
  if (!passed) process.exitCode = 1;
}

main();
