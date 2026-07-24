import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const HOST = '127.0.0.1';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

interface DragTelemetrySnapshot {
  panelWorkspace: {
    layoutCommits: number;
    dragStarts: number;
    dragCancels: number;
    successfulDrops: number;
    validDockDrops: number;
    floatingDrops: number;
    dragDurationCount: number;
    totalDragDurationMs: number;
    maxDragDurationMs: number;
    previewFrameCount: number;
    p95PreviewFrameIntervalMs: number;
    maxPreviewFrameIntervalMs: number;
    maxReducerDurationMs: number;
    persistenceWrites: number;
    totalPersistenceDurationMs: number;
  };
  workerTransport: {
    commandsSent: number;
    frameEventsReceived: number;
  };
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a profiler port'));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function readTelemetry(page: Page): Promise<DragTelemetrySnapshot> {
  return await page.evaluate(() => {
    const snapshot = (
      window as typeof window & {
        __M68K_IDE_PERF__?: { snapshot?: () => DragTelemetrySnapshot };
      }
    ).__M68K_IDE_PERF__?.snapshot?.();
    if (!snapshot) throw new Error('IDE performance telemetry is unavailable');
    return snapshot;
  });
}

async function dragWithFrameSamples(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<{
  elapsedMs: number;
  frameCount: number;
  p95FrameIntervalMs: number;
  maxFrameIntervalMs: number;
  beforeRelease: DragTelemetrySnapshot;
}> {
  await page.evaluate(`
    window.__PANEL_DRAG_PROFILE__ = { running: true, frames: [] };
    requestAnimationFrame(function collectPanelDragFrame(timestamp) {
      const profile = window.__PANEL_DRAG_PROFILE__;
      if (!profile || !profile.running) return;
      profile.frames.push(timestamp);
      requestAnimationFrame(collectPanelDragFrame);
    });
  `);
  const startedAt = performance.now();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step += 1) {
    const progress = step / 24;
    await page.mouse.move(
      from.x + (to.x - from.x) * progress,
      from.y + (to.y - from.y) * progress,
    );
    await page.waitForTimeout(8);
  }
  const beforeRelease = await readTelemetry(page);
  await page.mouse.up();
  const elapsedMs = performance.now() - startedAt;
  const frames = await page.evaluate(() => {
    const target = window as typeof window & {
      __PANEL_DRAG_PROFILE__?: { running: boolean; frames: number[] };
    };
    const profile = target.__PANEL_DRAG_PROFILE__;
    if (!profile) return [];
    profile.running = false;
    return profile.frames;
  });
  const intervals = frames.slice(1).map((value, index) => value - frames[index]!).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(intervals.length * 0.95) - 1);
  return {
    elapsedMs: round(elapsedMs),
    frameCount: frames.length,
    p95FrameIntervalMs: round(intervals[p95Index] ?? 0),
    maxFrameIntervalMs: round(intervals.at(-1) ?? 0),
    beforeRelease,
  };
}

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Unable to measure ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function main(): Promise<void> {
  const outputPath = path.resolve(repoRoot, arg('--output') ?? '.test-results/panel-drag-profile/current.json');
  const phase = arg('--phase') ?? 'current';
  const port = await reservePort();
  const baseUrl = `http://${HOST}:${port}`;
  const server = spawn('yarn', ['preview:e2e'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_IDE_AUTOPLAY: 'false', WEB_HOST: HOST, WEB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    await waitForServer(baseUrl, 180_000);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${baseUrl}/?ide_perf=1`);
      await page.getByTestId('ide-perf-probe').waitFor({ state: 'attached' });
      await page.waitForFunction(() =>
        Boolean((window as typeof window & { __M68K_IDE_PERF__?: { reset?: () => void } }).__M68K_IDE_PERF__?.reset)
      );
      await page.evaluate(() => {
        (window as typeof window & { __M68K_IDE_PERF__?: { reset?: () => void } }).__M68K_IDE_PERF__?.reset?.();
      });

      const before = await readTelemetry(page);
      const dockedSource = await centerOf(page, '[data-panel-instance-id="panel-terminal-1"] .panel-drag-handle');
      const explicitDockTarget = page.locator(
        '[data-panel-dock-target][data-panel-column-index="1"][data-panel-dock-relation="after"]',
      );
      const hasExplicitDockTarget = await explicitDockTarget.count() > 0;
      const dockedTarget = hasExplicitDockTarget
        ? await explicitDockTarget.boundingBox()
        : await page.getByTestId('panel-column-2').boundingBox();
      if (!dockedTarget) throw new Error('Unable to measure the docked drag target');
      const dockedDrag = await dragWithFrameSamples(page, dockedSource, {
        x: dockedTarget.x + dockedTarget.width / 2,
        y: dockedTarget.y + Math.min(dockedTarget.height / 2, 80),
      });
      await page.waitForTimeout(350);
      const afterDock = await readTelemetry(page);

      const floatButton = page.getByRole('button', { name: 'Float Screen' });
      if (await floatButton.count() === 1) await floatButton.click();
      await page.waitForTimeout(350);
      const beforeFloatMove = await readTelemetry(page);
      const floatingHeader = page.locator('.floating-panel-window .panel-frame-header');
      await floatingHeader.waitFor({ state: 'visible' });
      const floatingBox = await floatingHeader.boundingBox();
      const workspaceBox = await page.getByTestId('panel-workspace').boundingBox();
      if (!floatingBox || !workspaceBox) throw new Error('Unable to measure floating drag geometry');
      const floatingDrag = await dragWithFrameSamples(page, {
        x: floatingBox.x + Math.min(floatingBox.width * 0.4, 160),
        y: floatingBox.y + floatingBox.height / 2,
      }, {
        x: workspaceBox.x + workspaceBox.width * 0.45,
        y: workspaceBox.y + 20,
      });
      await page.waitForTimeout(350);
      const afterFloat = await readTelemetry(page);

      const result = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        phase,
        environment: {
          hostname: os.hostname(),
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          viewport: { width: 1280, height: 720 },
        },
        dockedDrag: {
          ...dockedDrag,
          beforeRelease: undefined,
          explicitDockTargetAvailable: hasExplicitDockTarget,
          preDropLayoutCommitDelta: dockedDrag.beforeRelease.panelWorkspace.layoutCommits - before.panelWorkspace.layoutCommits,
          preDropPersistenceWriteDelta: dockedDrag.beforeRelease.panelWorkspace.persistenceWrites - before.panelWorkspace.persistenceWrites,
          dragStartDelta: afterDock.panelWorkspace.dragStarts - before.panelWorkspace.dragStarts,
          successfulDropDelta: afterDock.panelWorkspace.successfulDrops - before.panelWorkspace.successfulDrops,
          validDockDropDelta: afterDock.panelWorkspace.validDockDrops - before.panelWorkspace.validDockDrops,
          layoutCommitDelta: afterDock.panelWorkspace.layoutCommits - before.panelWorkspace.layoutCommits,
          persistenceWriteDelta: afterDock.panelWorkspace.persistenceWrites - before.panelWorkspace.persistenceWrites,
          workerCommandDelta: afterDock.workerTransport.commandsSent - before.workerTransport.commandsSent,
          workerFrameDelta: afterDock.workerTransport.frameEventsReceived - before.workerTransport.frameEventsReceived,
          maxReducerDurationMs: afterDock.panelWorkspace.maxReducerDurationMs,
        },
        floatingDrag: {
          ...floatingDrag,
          beforeRelease: undefined,
          preDropLayoutCommitDelta: floatingDrag.beforeRelease.panelWorkspace.layoutCommits - beforeFloatMove.panelWorkspace.layoutCommits,
          preDropPersistenceWriteDelta: floatingDrag.beforeRelease.panelWorkspace.persistenceWrites - beforeFloatMove.panelWorkspace.persistenceWrites,
          dragStartDelta: afterFloat.panelWorkspace.dragStarts - beforeFloatMove.panelWorkspace.dragStarts,
          successfulDropDelta: afterFloat.panelWorkspace.successfulDrops - beforeFloatMove.panelWorkspace.successfulDrops,
          floatingDropDelta: afterFloat.panelWorkspace.floatingDrops - beforeFloatMove.panelWorkspace.floatingDrops,
          layoutCommitDelta: afterFloat.panelWorkspace.layoutCommits - beforeFloatMove.panelWorkspace.layoutCommits,
          persistenceWriteDelta: afterFloat.panelWorkspace.persistenceWrites - beforeFloatMove.panelWorkspace.persistenceWrites,
          workerCommandDelta: afterFloat.workerTransport.commandsSent - beforeFloatMove.workerTransport.commandsSent,
          workerFrameDelta: afterFloat.workerTransport.frameEventsReceived - beforeFloatMove.workerTransport.frameEventsReceived,
          floatingPanelCount: await page.locator('.floating-panel-window').count(),
          maxReducerDurationMs: afterFloat.panelWorkspace.maxReducerDurationMs,
        },
        telemetry: afterFloat.panelWorkspace,
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
