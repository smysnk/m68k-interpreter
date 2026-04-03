import { describe, expect, it } from 'vitest';
import { ENGINE_PROFILE_SMOKE_SCENARIOS } from './engineScenarios';
import { formatEngineBatteryRows, profileEngineBattery } from './engineHarness';

describe('engine performance harness', () => {
  it(
    'profiles the shared engine battery for the classic interpreter',
    () => {
      const report = profileEngineBattery(ENGINE_PROFILE_SMOKE_SCENARIOS, {
        warmupRuns: 0,
        measuredRuns: 1,
      });

      expect(report.scenarios).toHaveLength(ENGINE_PROFILE_SMOKE_SCENARIOS.length);

      for (const scenarioReport of report.scenarios) {
        expect(scenarioReport.interpreter.sampleCount).toBe(1);
        expect(scenarioReport.interpreter.elapsedMs.median).toBeGreaterThanOrEqual(0);
        expect(scenarioReport.interpreter.steps).toBeGreaterThanOrEqual(0);
      }

      console.table(formatEngineBatteryRows(report));
    },
    120000
  );
});
