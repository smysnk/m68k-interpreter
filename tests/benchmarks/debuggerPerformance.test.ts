import { describe, expect, it } from 'vitest';
import { profileDebuggerPerformance } from './debuggerPerformance';

describe('recursive debugger performance guard', () => {
  it('retains a fast empty-index path and bounds active instrumentation cost', () => {
    const metrics = profileDebuggerPerformance({ instructions: 5_000, measuredRuns: 3 });
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));
    const baseline = byId.get('zero-breakpoints');
    expect(baseline?.instructionsPerSecond).toBeGreaterThan(0);
    expect(byId.get('100-conditional-misses')!.medianMs).toBeLessThan(baseline!.medianMs * 25);
    expect(byId.get('1000-conditional-misses')!.medianMs).toBeLessThan(baseline!.medianMs * 100);
    expect(byId.get('write-watchpoint-observer-miss')!.medianMs).toBeLessThan(
      baseline!.medianMs * 25
    );
  });
});
