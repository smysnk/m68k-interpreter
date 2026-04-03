import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import {
  createBrowserBenchmarkSuitePayload,
  createFailedSuitePayload,
  emitStructuredSuitePayload,
  formatSuiteConsoleHeading,
  resolveRunnerKey,
  type BrowserBenchmarkScenarioMetric,
} from './testStationMetrics';

const SUITE_LABEL = 'Nibbles Browser Gameplay Benchmark';
const HOST = '127.0.0.1';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

async function main(): Promise<void> {
  const startedAt = performance.now();

  try {
    const port = await reservePort();
    const baseUrl = `http://${HOST}:${port}`;
    const server = spawn('yarn', ['preview:e2e'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WEB_HOST: HOST,
        WEB_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    const stderrChunks: string[] = [];
    server.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));

    try {
      await waitForServer(baseUrl, 180_000);

      const browser = await chromium.launch({
        headless: true,
      });

      try {
        const metrics = await runGameplayScenarios(browser, baseUrl);

        console.error(formatSuiteConsoleHeading(SUITE_LABEL));
        for (const metric of metrics) {
          console.error(
            `${metric.scenarioId}: ${metric.elapsedMs.toFixed(2)}ms (${metric.terminalRows}x${metric.terminalColumns})`
          );
        }

        const warnings = [];
        if (stderrChunks.length > 0) {
          warnings.push('preview server emitted stderr output during benchmark run');
        }

        emitStructuredSuitePayload(
          createBrowserBenchmarkSuitePayload({
            suiteLabel: SUITE_LABEL,
            durationMs: performance.now() - startedAt,
            runnerKey: resolveRunnerKey({ browserName: 'chromium-headless' }),
            browserName: 'chromium',
            seriesId: 'chromium-headless',
            scenarioMetrics: metrics,
            warnings,
          })
        );
      } finally {
        await browser.close();
      }
    } finally {
      await stopServer(server);
    }
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

async function runGameplayScenarios(
  browser: Browser,
  baseUrl: string
): Promise<BrowserBenchmarkScenarioMetric[]> {
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
  });
  const page = await context.newPage();

  try {
    const speedMultiplier = String(
      Number.parseInt(String(process.env.TEST_STATION_BROWSER_BENCHMARK_SPEED || ''), 10) || 8
    );

    await page.goto(`${baseUrl}/`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const terminalTab = page.getByRole('tab', { name: /terminal/i });
    const terminalScreen = page.getByTestId('terminal-screen');
    const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
    const runButton = page.getByRole('button', { name: /run program/i });
    const speedInput = page.getByLabel('Speed (x)');

    await terminalTab.waitFor({ state: 'visible', timeout: 30_000 });
    await terminalScreen.waitFor({ state: 'visible', timeout: 30_000 });
    await fileExplorerTab.waitFor({ state: 'visible', timeout: 30_000 });
    await runButton.waitFor({ state: 'visible', timeout: 30_000 });
    await fileExplorerTab.hover();
    await page.getByRole('button', { name: /nibbles\.asm/i }).click();
    await speedInput.fill(speedMultiplier);

    const introStartedAt = performance.now();
    await runButton.click();
    const introText = await waitForTerminalMarker(page, ['Movement Keys', 'Joshua Bellamy', 'smysnk.com'], 60_000);
    await page.getByText(/waiting for input/i).waitFor({ state: 'visible', timeout: 30_000 });
    const introElapsedMs = performance.now() - introStartedAt;
    const introGeometry = await readTerminalGeometry(page);

    await terminalScreen.click();
    const arenaStartedAt = performance.now();
    await page.keyboard.press('s');
    await page.keyboard.press('Enter');
    const arenaText = await waitForTerminalMarker(page, ['SCORE:', 'LEVEL:'], 60_000);
    const arenaElapsedMs = performance.now() - arenaStartedAt;
    const arenaGeometry = await readTerminalGeometry(page);

    return [
      {
        scenarioId: 'nibbles-browser-intro',
        title: 'Nibbles Browser Intro',
        statGroup: 'benchmark.browser.gameplay.nibbles.intro',
        elapsedMs: introElapsedMs,
        terminalRows: introGeometry.rows,
        terminalColumns: introGeometry.columns,
        terminalText: introText,
        assertions: [
          'intro menu rendered in the terminal display',
          'terminal reached waiting-for-input state',
        ],
      },
      {
        scenarioId: 'nibbles-browser-arena-boot',
        title: 'Nibbles Browser Arena Boot',
        statGroup: 'benchmark.browser.gameplay.nibbles.arena_boot',
        elapsedMs: arenaElapsedMs,
        terminalRows: arenaGeometry.rows,
        terminalColumns: arenaGeometry.columns,
        terminalText: arenaText,
        assertions: [
          'difficulty selection reached the gameplay arena',
          'score and level HUD rendered in the terminal display',
        ],
      },
    ];
  } finally {
    await page.close();
    await context.close();
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore connection races while the preview server starts.
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for benchmark preview server at ${url}`);
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.killed || server.exitCode !== null) {
    return;
  }

  server.kill('SIGTERM');
  const exited = await Promise.race([
    onceExit(server).then(() => true),
    delay(5_000).then(() => false),
  ]);

  if (!exited && !server.killed && server.exitCode === null) {
    server.kill('SIGKILL');
    await onceExit(server);
  }
}

function onceExit(server: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    server.once('exit', () => resolve());
  });
}

async function waitForTerminalMarker(
  page: Page,
  markers: string[],
  timeoutMs: number
): Promise<string> {
  const startedAt = performance.now();
  let lastTerminalText = '';

  while (performance.now() - startedAt < timeoutMs) {
    const terminalText = await readTerminalText(page);
    lastTerminalText = terminalText;
    if (markers.every((marker) => terminalText.includes(marker))) {
      return terminalText;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for terminal markers: ${markers.join(', ')}\nLast terminal text:\n${lastTerminalText}`
  );
}

async function readTerminalText(page: Page): Promise<string> {
  return page.getByTestId('terminal-screen').evaluate((element) => {
    const lines = Array.from(element.querySelectorAll('.retro-lcd__line'));

    return lines
      .map((line) =>
        Array.from(line.querySelectorAll('.retro-lcd__cell'))
          .map((cell) => {
            const text = cell.textContent ?? '';
            return text === '\u00a0' ? ' ' : text;
          })
          .join('')
      )
      .join('\n');
  });
}

async function readTerminalGeometry(page: Page): Promise<{ rows: number; columns: number }> {
  return page.getByTestId('terminal-screen').evaluate((element) => {
    const lines = Array.from(element.querySelectorAll('.retro-lcd__line'));
    const columns = lines.length > 0 ? lines[0]?.querySelectorAll('.retro-lcd__cell').length ?? 0 : 0;

    return {
      rows: lines.length,
      columns,
    };
  });
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve an ephemeral benchmark port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

void main();
