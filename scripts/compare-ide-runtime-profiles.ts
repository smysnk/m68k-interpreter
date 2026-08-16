import fs from 'node:fs';
import path from 'node:path';

interface HardwareSurfaceSummary {
  averageCommandAckLatencyMs: number;
  maxCommandAckLatencyMs: number;
}

interface ScenarioSummary {
  id: string;
  introElapsedMs: number;
  gameplayElapsedMs: number;
  hardwareSurface: HardwareSurfaceSummary;
}

interface Report {
  scenarios: ScenarioSummary[];
}

interface MetricComparison {
  baseline: number;
  candidate: number;
  changeRatio: number;
  allowanceRatio: number;
  passed: boolean;
}

function compareMetric(
  baseline: number,
  candidate: number,
  allowanceRatio: number,
  absoluteNoiseFloor = 0
): MetricComparison {
  const changeRatio = baseline === 0 ? 0 : candidate / baseline - 1;
  const varianceAwareAllowance =
    baseline === 0 ? allowanceRatio : Math.max(allowanceRatio, absoluteNoiseFloor / baseline);
  return {
    baseline,
    candidate,
    changeRatio,
    allowanceRatio: varianceAwareAllowance,
    passed: changeRatio <= varianceAwareAllowance,
  };
}

const baselinePath = path.resolve(
  process.argv[2] ?? '.test-results/cpu-machine-profile-separation/baseline/ide-runtime.json'
);
const candidatePath = path.resolve(
  process.argv[3] ?? '.test-results/cpu-machine-profile-separation/final/ide-runtime.json'
);
const outputPath = path.resolve(
  process.argv[4] ?? '.test-results/cpu-machine-profile-separation/final/ide-runtime-comparison.md'
);
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as Report;
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as Report;

const scenarios = candidate.scenarios.map((current) => {
  const previous = baseline.scenarios.find((scenario) => scenario.id === current.id);
  if (!previous) return { id: current.id, passed: false, reason: 'missing baseline' };
  const intro = compareMetric(previous.introElapsedMs, current.introElapsedMs, 0.1);
  const gameplay = compareMetric(previous.gameplayElapsedMs, current.gameplayElapsedMs, 0.1);
  const averageHardwareAck = compareMetric(
    previous.hardwareSurface.averageCommandAckLatencyMs,
    current.hardwareSurface.averageCommandAckLatencyMs,
    0.15,
    1
  );
  const maxHardwareAck = compareMetric(
    previous.hardwareSurface.maxCommandAckLatencyMs,
    current.hardwareSurface.maxCommandAckLatencyMs,
    0.15,
    1
  );
  const hardwareScenario = current.id.includes('hardware');
  return {
    id: current.id,
    passed:
      intro.passed &&
      gameplay.passed &&
      (!hardwareScenario || (averageHardwareAck.passed && maxHardwareAck.passed)),
    intro,
    gameplay,
    averageHardwareAck,
    maxHardwareAck,
    hardwareAckGateApplies: hardwareScenario,
  };
});

const rows = scenarios.map((scenario) => {
  if ('reason' in scenario) {
    return `| ${scenario.id} | - | - | - | FAIL |`;
  }
  const ackChange = scenario.hardwareAckGateApplies
    ? `${(scenario.averageHardwareAck.changeRatio * 100).toFixed(1)}%`
    : 'informational';
  return `| ${scenario.id} | ${(scenario.intro.changeRatio * 100).toFixed(1)}% | ${(scenario.gameplay.changeRatio * 100).toFixed(1)}% | ${ackChange} | ${scenario.passed ? 'PASS' : 'FAIL'} |`;
});
const markdown = `# IDE runtime performance comparison

Product timing allows a 10% regression. Hardware command acknowledgement uses
the wider of 15% or a 1 ms browser/worker scheduling noise floor for the two
hardware-focused scenarios; the Nibbles acknowledgement values are informational
because those scenarios do not exercise the hardware panel.

| Scenario | Intro change | Gameplay change | Average hardware acknowledgement | Gate |
| --- | ---: | ---: | ---: | --- |
${rows.join('\n')}
`;
const result = {
  generatedAt: new Date().toISOString(),
  baselinePath,
  candidatePath,
  passed: scenarios.every((scenario) => scenario.passed),
  scenarios,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);
fs.writeFileSync(outputPath.replace(/\.md$/i, '.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(markdown);
