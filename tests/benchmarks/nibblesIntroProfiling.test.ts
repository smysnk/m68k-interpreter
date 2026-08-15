import { describe, expect, it } from 'vitest';
import { profileScenario } from './engineHarness';
import { NIBBLES_INTRO_BENCHMARK_SCENARIO } from './engineScenarios';

describe('nibbles intro benchmark', () => {
  it('profiles strict-core time-to-intro-screen with the Easy68K adapter', () => {
    const report = profileScenario(NIBBLES_INTRO_BENCHMARK_SCENARIO, {
      warmupRuns: 0,
      measuredRuns: 1,
    });

    expect(report.interpreter.sampleCount).toBe(1);

    console.table([
      {
        scenario: report.scenario.id,
        'interp median ms': Number(report.interpreter.elapsedMs.median.toFixed(2)),
        'interp steps/s': Number(report.interpreter.stepsPerSecond.median.toFixed(2)),
        'interp heap KB': Number((report.interpreter.heapDeltaBytes.median / 1024).toFixed(2)),
        steps: report.interpreter.steps,
      },
    ]);
  }, 120000);
});
