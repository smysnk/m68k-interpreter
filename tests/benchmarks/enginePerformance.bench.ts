import { bench, describe } from 'vitest';
import { ENGINE_BENCHMARK_SCENARIOS } from './engineScenarios';
import { runBenchmarkScenario } from './engineHarness';

describe('engine benchmark comparison', () => {
  for (const scenario of ENGINE_BENCHMARK_SCENARIOS) {
    bench(
      `${scenario.id} / interpreter`,
      () => {
        runBenchmarkScenario('interpreter', scenario);
      },
      {
        iterations: 1,
        warmupIterations: 0,
      }
    );
  }
});
