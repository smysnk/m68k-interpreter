import fs from 'node:fs';
import path from 'node:path';

interface Summary {
  median: number;
  p95: number;
  mad: number;
}
interface ScenarioEntry {
  id?: string;
  scenario?: { id: string };
  summary?: { elapsedMs: Summary; heapDeltaBytes: Summary };
  interpreter?: { elapsedMs: Summary; heapDeltaBytes: Summary };
}
interface Report {
  scenarios: ScenarioEntry[];
}

interface ComparisonGate {
  baseline: number;
  candidate: number;
  changeRatio: number;
  allowanceRatio: number;
  passed: boolean;
}

function normalize(entry: ScenarioEntry) {
  const metrics = entry.interpreter ?? entry.summary;
  if (!metrics)
    throw new Error(`Scenario ${entry.id ?? entry.scenario?.id ?? 'unknown'} has no metrics`);
  return { id: entry.id ?? entry.scenario?.id ?? 'unknown', metrics };
}

const baselinePath = path.resolve(
  process.argv[2] ?? '.test-results/cpu-machine-profile-separation/baseline/engine.json'
);
const candidatePath = path.resolve(
  process.argv[3] ?? '.test-results/cpu-machine-profile-separation/final/engine.json'
);
const outputPath = path.resolve(
  process.argv[4] ?? '.test-results/cpu-machine-profile-separation/final/comparison.md'
);
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as Report;
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as Report;
const baselineScenarios = baseline.scenarios.map(normalize);
const comparisons = candidate.scenarios.map((rawEntry) => {
  const entry = normalize(rawEntry);
  const previous = baselineScenarios.find((item) => item.id === entry.id);
  if (!previous) {
    return {
      id: entry.id,
      passed: true,
      reason: 'new scenario',
    };
  }
  const change = (entry.metrics.elapsedMs.median / previous.metrics.elapsedMs.median - 1) * 100;
  const allowance = Math.max(
    0.1,
    (2 * previous.metrics.elapsedMs.mad) / previous.metrics.elapsedMs.median
  );
  const p95Change = entry.metrics.elapsedMs.p95 / previous.metrics.elapsedMs.p95 - 1;
  const p95Allowance = Math.max(
    0.15,
    (2 * previous.metrics.elapsedMs.mad) / previous.metrics.elapsedMs.p95,
    0.1 / previous.metrics.elapsedMs.p95
  );
  const heapAllowance = Math.abs(previous.metrics.heapDeltaBytes.median) * 1.1;
  const medianGate: ComparisonGate = {
    baseline: previous.metrics.elapsedMs.median,
    candidate: entry.metrics.elapsedMs.median,
    changeRatio: change / 100,
    allowanceRatio: allowance,
    passed: change / 100 <= allowance,
  };
  const p95Gate: ComparisonGate = {
    baseline: previous.metrics.elapsedMs.p95,
    candidate: entry.metrics.elapsedMs.p95,
    changeRatio: p95Change,
    allowanceRatio: p95Allowance,
    passed: p95Change <= p95Allowance,
  };
  const heapGate: ComparisonGate = {
    baseline: previous.metrics.heapDeltaBytes.median,
    candidate: entry.metrics.heapDeltaBytes.median,
    changeRatio:
      previous.metrics.heapDeltaBytes.median === 0
        ? 0
        : entry.metrics.heapDeltaBytes.median / previous.metrics.heapDeltaBytes.median - 1,
    allowanceRatio: 0.1,
    passed: entry.metrics.heapDeltaBytes.median <= heapAllowance,
  };
  return {
    id: entry.id,
    passed: medianGate.passed && p95Gate.passed && heapGate.passed,
    median: medianGate,
    p95: p95Gate,
    heap: heapGate,
  };
});
const rows = comparisons.map((comparison) => {
  if ('reason' in comparison) {
    return `| ${comparison.id} | new workload | - | - | - | - | NEW |`;
  }
  return `| ${comparison.id} | ${comparison.median.baseline.toFixed(3)} | ${comparison.median.candidate.toFixed(3)} | ${(comparison.median.changeRatio * 100).toFixed(1)}% | ${(comparison.p95.changeRatio * 100).toFixed(1)}% | ${(comparison.heap.changeRatio * 100).toFixed(1)}% | ${comparison.passed ? 'PASS' : 'FAIL'} |`;
});
const markdown = `# CPU and machine profile performance comparison

The p95 gate uses the widest of 15%, two baseline MADs, or a 0.1 ms
measurement-noise floor. This preserves the 15% tail-latency gate while avoiding
false regressions for sub-millisecond workloads whose raw samples are retained in
the candidate report.

| Scenario | Baseline median ms | Candidate median ms | Median change | p95 change | Heap change | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}
`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);
fs.writeFileSync(
  outputPath.replace(/\.md$/i, '.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baselinePath,
      candidatePath,
      passed: comparisons.every((comparison) => comparison.passed),
      scenarios: comparisons,
    },
    null,
    2
  )}\n`
);
console.log(markdown);
