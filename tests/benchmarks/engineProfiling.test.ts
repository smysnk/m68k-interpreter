import { describe, expect, it } from 'vitest';
import { ENGINE_PROFILE_SMOKE_SCENARIOS } from './engineScenarios';
import { formatEngineBatteryRows, profileEngineBattery } from './engineHarness';

describe('engine performance harness', () => {
  it(
    'profiles the shared engine battery and preserves final-state parity',
    () => {
      const report = profileEngineBattery(ENGINE_PROFILE_SMOKE_SCENARIOS, {
        warmupRuns: 0,
        measuredRuns: 1,
      });

      expect(report.scenarios).toHaveLength(ENGINE_PROFILE_SMOKE_SCENARIOS.length);

      for (const scenarioReport of report.scenarios) {
        expect(scenarioReport.interpreter.sampleCount).toBe(1);
        expect(scenarioReport.interpreterRedux.sampleCount).toBe(1);
        expect(scenarioReport.interpreter.elapsedMs.median).toBeGreaterThanOrEqual(0);
        expect(scenarioReport.interpreterRedux.elapsedMs.median).toBeGreaterThanOrEqual(0);
        expect(scenarioReport.interpreter.steps).toBeGreaterThanOrEqual(0);
        expect(scenarioReport.interpreterRedux.steps).toBeGreaterThanOrEqual(0);
        expect(scenarioReport.interpreter.finalSnapshot).toEqual(
          scenarioReport.interpreterRedux.finalSnapshot
        );
      }

      console.table(formatEngineBatteryRows(report));
    },
    120000
  );
});
