import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  createFailedSuitePayload,
  emitStructuredSuitePayload,
  resolveRunnerKey,
  type StructuredPerformanceStat,
  type StructuredSuitePayload,
} from './testStationMetrics';

const HOST = '127.0.0.1';
const SOURCE = `START
  MOVEQ #0,D0
LOOP
  ADDQ.L #1,D0
  BRA LOOP
  END START`;
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const phase = process.env.DEBUGGER_PROFILE_PHASE ?? 'unspecified';

interface DebuggerBrowserMetric {
  pauseToSnapshotMs: number;
  pauseToHighlightMs: number;
  steadyStateHeaderRenders: number;
  steadyStateSnapshotDispatches: number;
  medianSnapshotPayloadBytes: number;
  p95SnapshotPayloadBytes: number;
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  try {
    const port = await reservePort();
    const baseUrl = `http://${HOST}:${port}`;
    const server = spawn('yarn', ['preview:e2e'], {
      cwd: repoRoot,
      env: { ...process.env, WEB_HOST: HOST, WEB_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    try {
      await waitForServer(baseUrl, 180_000);
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto(`${baseUrl}/?ide_perf=1`, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForFunction(
          () => typeof window.__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus === 'function'
        );
        const sourceIdeStatus = await page.evaluate(() =>
          window.__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus()
        );
        if (sourceIdeStatus !== 'none') {
          await page.evaluate(() =>
            window.__M68K_IDE_TEST_CONTROLS__?.ignoreSourceConfiguration()
          );
          await page.waitForFunction(
            () => window.__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus() === 'ignored'
          );
        }
        await page.evaluate((source) => {
          window.__M68K_IDE_TEST_CONTROLS__?.setPanelPreset('code-run');
          window.__M68K_IDE_TEST_CONTROLS__?.loadSource(source);
        }, SOURCE);
        const debugButton = page.getByRole('button', { name: 'Pause for debugging' }).first();
        await debugButton.waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Start program', exact: true }).click();
        await page.waitForFunction(() => {
          const button = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Pause for debugging"]'
          );
          return button?.disabled === false;
        });

        await page.evaluate(() => window.__M68K_IDE_PERF__?.reset());
        await page.waitForTimeout(1_000);
        const steady = await page.evaluate(() => window.__M68K_IDE_PERF__!.snapshot());
        const pauseStartedAt = performance.now();
        await debugButton.click();
        await page.locator('.cm-debug-current-line').first().waitFor({ state: 'visible' });
        await page
          .locator('[data-expanded="true"][aria-label="Code debugging controls"]')
          .first()
          .waitFor({ state: 'visible' });
        const pauseToHighlightMs = performance.now() - pauseStartedAt;
        const paused = await page.evaluate(() => window.__M68K_IDE_PERF__!.snapshot());
        const metric: DebuggerBrowserMetric = {
          pauseToSnapshotMs: paused.debuggerSurface.lastPauseToSnapshotLatencyMs,
          pauseToHighlightMs,
          steadyStateHeaderRenders:
            steady.renderStats.find((stat) => stat.id === 'CodeDebuggerHeaderAccessory')
              ?.renderCount ?? 0,
          steadyStateSnapshotDispatches: steady.debuggerSurface.snapshotDispatchCount,
          medianSnapshotPayloadBytes: paused.debuggerSurface.medianSnapshotPayloadBytes,
          p95SnapshotPayloadBytes: paused.debuggerSurface.p95SnapshotPayloadBytes,
        };
        emitStructuredSuitePayload(createPayload(metric, performance.now() - startedAt));
      } finally {
        await browser.close();
      }
    } finally {
      await stopServer(server);
    }
  } catch (error) {
    emitStructuredSuitePayload(
      createFailedSuitePayload({
        suiteLabel: 'Debugger Browser Performance',
        durationMs: performance.now() - startedAt,
        error,
      })
    );
  }
}

function createPayload(metric: DebuggerBrowserMetric, durationMs: number): StructuredSuitePayload {
  const metadata = {
    phase,
    runnerKey: resolveRunnerKey({ browserName: 'chromium-headless' }),
    statistic: 'observed',
  };
  const performanceStats: StructuredPerformanceStat[] = [
    ['pause_to_frame_ms', metric.pauseToSnapshotMs, 'ms'],
    ['pause_to_highlight_ms', metric.pauseToHighlightMs, 'ms'],
    ['steady_state_header_renders', metric.steadyStateHeaderRenders, 'count'],
    ['steady_state_snapshot_dispatches', metric.steadyStateSnapshotDispatches, 'count'],
    ['snapshot_payload_median_bytes', metric.medianSnapshotPayloadBytes, 'bytes'],
    ['snapshot_payload_p95_bytes', metric.p95SnapshotPayloadBytes, 'bytes'],
  ].map(([statName, numericValue, unit]) => ({
    statGroup: 'benchmark.browser.debugger.control_surface',
    statName: String(statName),
    unit: String(unit),
    numericValue: Number(numericValue),
    metadata,
  }));
  return {
    status: 'passed',
    durationMs,
    summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
    warnings: [],
    tests: [
      {
        name: 'unchanged execution publication',
        fullName: 'Debugger Browser Performance unchanged execution publication',
        status: 'passed',
        durationMs: 1_000,
        assertions: [
          `${metric.steadyStateSnapshotDispatches} debugger snapshot dispatches during one second of unchanged execution`,
          `${metric.steadyStateHeaderRenders} Code-header renders during one second of unchanged execution`,
        ],
        module: 'debugger',
        theme: 'benchmark',
        classificationSource: 'debugger-browser-profiler',
      },
      {
        name: 'manual pause visibility',
        fullName: 'Debugger Browser Performance manual pause visibility',
        status: 'passed',
        durationMs: metric.pauseToHighlightMs,
        assertions: [
          'manual pause published a debugger snapshot',
          'current source line became visible',
        ],
        module: 'debugger',
        theme: 'benchmark',
        classificationSource: 'debugger-browser-profiler',
      },
    ],
    rawArtifacts: [
      {
        relativePath: `benchmarks/debugger-browser-${phase}.json`,
        label: `Debugger browser performance ${phase}`,
        content: `${JSON.stringify(metric, null, 2)}\n`,
        mediaType: 'application/json',
      },
    ],
    performanceStats,
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The preview process may not have acquired the port yet.
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for debugger benchmark server at ${url}`);
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.killed || server.exitCode !== null) return;
  server.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => server.once('exit', () => resolve(true))),
    delay(5_000).then(() => false),
  ]);
  if (!exited && !server.killed && server.exitCode === null) server.kill('SIGKILL');
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a debugger benchmark port')));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

void main();
