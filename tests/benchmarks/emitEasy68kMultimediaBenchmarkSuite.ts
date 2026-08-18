import { performance } from 'node:perf_hooks';
import { Easy68kGraphicsDevice, Easy68kSoundDevice } from '@m68k/interpreter';
import {
  createFailedSuitePayload,
  emitStructuredSuitePayload,
  resolveRunnerKey,
  type StructuredPerformanceStat,
  type StructuredSuitePayload,
} from './testStationMetrics';

const SUITE_LABEL = 'Easy68K Multimedia Performance';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function profile(operation: () => void, runs = 20): { median: number; p95: number } {
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return { median: median(samples), p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0 };
}

function wav(): Uint8Array {
  const bytes = new Uint8Array(44);
  bytes.set(
    [...'RIFF'].map((character) => character.charCodeAt(0)),
    0
  );
  new DataView(bytes.buffer).setUint32(4, 36, true);
  bytes.set(
    [...'WAVE'].map((character) => character.charCodeAt(0)),
    8
  );
  bytes.set(
    [...'fmt '].map((character) => character.charCodeAt(0)),
    12
  );
  new DataView(bytes.buffer).setUint32(16, 16, true);
  bytes.set(
    [...'data'].map((character) => character.charCodeAt(0)),
    36
  );
  return bytes;
}

function main(): void {
  const startedAt = performance.now();
  try {
    const line = profile(() => {
      const graphics = new Easy68kGraphicsDevice();
      graphics.drawLine(0, 0, 639, 479);
      graphics.consumePatch();
    });
    const fill = profile(() => {
      const graphics = new Easy68kGraphicsDevice();
      graphics.setPenColor(0xff);
      graphics.drawRectangle(0, 0, 255, 255, false);
      graphics.setFillColor(0xff00);
      graphics.floodFill(128, 128);
      graphics.consumePatch();
    }, 10);
    const graphics = new Easy68kGraphicsDevice();
    graphics.consumePatch();
    graphics.setPenColor(0xff);
    graphics.drawLine(10, 10, 110, 10);
    const patch = graphics.consumePatch();
    const before = graphics.snapshot();
    graphics.drawPixel(1, 1);
    const after = graphics.snapshot();
    const copiedTiles = after.frontTiles.filter(
      (tile, index) => tile !== before.frontTiles[index]
    ).length;
    const sound = new Easy68kSoundDevice([{ id: 'tone', path: 'tone.wav', bytes: wav() }]);
    const soundCommands = profile(() => {
      sound.stopAll();
      sound.consumeCommands();
    }, 1000);
    const runnerKey = resolveRunnerKey();
    const metric = (
      statName: string,
      unit: string,
      numericValue: number
    ): StructuredPerformanceStat => ({
      statGroup: 'benchmark.node.easy68k.multimedia',
      statName,
      unit,
      numericValue,
      metadata: { runnerKey, seriesId: 'easy68k-multimedia', statistic: 'measured' },
    });
    const performanceStats = [
      metric('line_median_ms', 'ms', line.median),
      metric('line_p95_ms', 'ms', line.p95),
      metric('flood_fill_median_ms', 'ms', fill.median),
      metric('flood_fill_p95_ms', 'ms', fill.p95),
      metric('dirty_patch_bytes', 'bytes', patch?.pixels.byteLength ?? 0),
      metric('snapshot_copied_tiles', 'count', copiedTiles),
      metric('snapshot_copied_bytes', 'bytes', copiedTiles * 64 * 64 * 4),
      metric('sound_command_median_ms', 'ms', soundCommands.median),
      metric('sound_command_p95_ms', 'ms', soundCommands.p95),
    ];
    const report = { generatedAt: new Date().toISOString(), performanceStats };
    const payload: StructuredSuitePayload = {
      status: 'passed',
      durationMs: performance.now() - startedAt,
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      warnings: [],
      tests: [
        {
          name: SUITE_LABEL,
          fullName: SUITE_LABEL,
          status: 'passed',
          durationMs: performance.now() - startedAt,
          assertions: ['dirty patch is bounded', 'copy-on-write snapshot changes one tile'],
          module: 'runtime',
          theme: 'benchmark',
          classificationSource: 'multimedia-benchmark',
        },
      ],
      rawArtifacts: [
        {
          relativePath: 'benchmarks/easy68k-multimedia.json',
          label: 'Easy68K multimedia benchmark report',
          content: `${JSON.stringify(report, null, 2)}\n`,
          mediaType: 'application/json',
        },
      ],
      performanceStats,
    };
    if ((patch?.pixels.byteLength ?? Infinity) > 4096 || copiedTiles !== 1) {
      throw new Error('Multimedia dirty-region or copy-on-write budget failed.');
    }
    emitStructuredSuitePayload(payload);
  } catch (error) {
    emitStructuredSuitePayload(
      createFailedSuitePayload({
        suiteLabel: SUITE_LABEL,
        durationMs: performance.now() - startedAt,
        error,
      })
    );
  }
}

main();
