import { describe, expect, it } from 'vitest';
import { profileScenarioPair } from './engineHarness';
import { NIBBLES_INTRO_BENCHMARK_SCENARIO } from './engineScenarios';

describe('nibbles intro benchmark', () => {
  it(
    'compares both engines on time-to-intro-screen',
    () => {
      const report = profileScenarioPair(NIBBLES_INTRO_BENCHMARK_SCENARIO, {
        warmupRuns: 0,
        measuredRuns: 1,
      });

      expect(report.interpreter.sampleCount).toBe(1);
      expect(report.interpreterRedux.sampleCount).toBe(1);
      expect(report.interpreter.finalSnapshot).toEqual(report.interpreterRedux.finalSnapshot);

      console.table([
        {
          scenario: report.scenario.id,
          'interp median ms': Number(report.interpreter.elapsedMs.median.toFixed(2)),
          'redux median ms': Number(report.interpreterRedux.elapsedMs.median.toFixed(2)),
          'redux/interp ms': Number(report.elapsedRatio.toFixed(2)),
          'interp steps/s': Number(report.interpreter.stepsPerSecond.median.toFixed(2)),
          'redux steps/s': Number(report.interpreterRedux.stepsPerSecond.median.toFixed(2)),
          'redux/interp steps/s': Number(report.throughputRatio.toFixed(2)),
          'interp heap KB': Number((report.interpreter.heapDeltaBytes.median / 1024).toFixed(2)),
          'redux heap KB': Number((report.interpreterRedux.heapDeltaBytes.median / 1024).toFixed(2)),
          steps: report.interpreter.steps,
        },
      ]);
    },
    120000
  );
});
