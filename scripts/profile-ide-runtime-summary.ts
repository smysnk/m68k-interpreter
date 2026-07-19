import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  loadNibbles as loadNibblesFixture,
  readTerminalSnapshot,
  scheduleDeferredGameplayInput,
  startGameplayFromIntroTouch,
  touchTerminalRelativeDirection,
  waitForIntro,
} from '../tests/e2e/nibblesE2eHelpers';

interface ProfileIdeRuntimeOptions {
  json: boolean;
}

interface RenderHotspotRow {
  id: string;
  renderCount: number;
  actualDurationMs: number;
  maxActualDurationMs: number;
}

interface RuntimeSyncSummary {
  callCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  averageDurationMs: number;
  reusedRegisters: number;
  reusedFlags: number;
  reusedMemory: number;
  reusedTerminal: number;
  publishedMemory: number;
  publishedTerminal: number;
}

interface WorkerTransportSummary {
  commandsSent: number;
  eventsReceived: number;
  readyEventsReceived: number;
  repliesReceived: number;
  frameEventsReceived: number;
  stoppedEventsReceived: number;
  faultEventsReceived: number;
  framesWithMemoryImage: number;
  framesWithTerminalFrameBuffer: number;
  framesWithTerminalSnapshot: number;
  framesWithHardwareSnapshot: number;
}

interface HardwareSurfaceSummary {
  snapshotsReceived: number;
  snapshotsPublished: number;
  snapshotsReused: number;
  noOpSnapshots: number;
  outputVersionChanges: number;
  framesWithHardwareSnapshot: number;
  approximatePayloadBytes: number;
  commandRequests: number;
  commandAcceptances: number;
  commandAcknowledgements: number;
  commandRejections: number;
  averageCommandAckLatencyMs: number;
  maxCommandAckLatencyMs: number;
  visibleStateLatencies: number;
  averageVisibleStateLatencyMs: number;
  maxVisibleStateLatencyMs: number;
}

interface TerminalRepaintSummary {
  repaintCount: number;
  fullRedrawCount: number;
  rowPatchCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  averageDurationMs: number;
  totalAnsiBytes: number;
  totalRowsPatched: number;
}

interface TouchLatencySummary {
  dispatchCount: number;
  totalDispatchDurationMs: number;
  maxDispatchDurationMs: number;
  averageDispatchDurationMs: number;
  lastDispatchDurationMs: number;
  visualLatencyCount: number;
  totalVisualLatencyMs: number;
  maxVisualLatencyMs: number;
  averageVisualLatencyMs: number;
  lastVisualLatencyMs: number;
}

interface IdeRuntimeScenarioSummary {
  id: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  shellMode: string | null;
  inputMode: string | null;
  terminalRows: number | null;
  terminalColumns: number | null;
  introElapsedMs: number;
  gameplayElapsedMs: number;
  heapGrowthBytes: number | null;
  postCancelFrameDelta: number | null;
  topRenderHotspots: RenderHotspotRow[];
  runtimeSync: RuntimeSyncSummary;
  workerTransport: WorkerTransportSummary;
  hardwareSurface: HardwareSurfaceSummary;
  terminalRepaint: TerminalRepaintSummary;
  touchLatency: TouchLatencySummary;
}

interface IdePerformanceSnapshot {
  renderStats: Array<{
    id: string;
    renderCount: number;
    actualDurationMs: number;
    maxActualDurationMs: number;
  }>;
  runtimeSync: {
    callCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
    reusedRegisters: number;
    reusedFlags: number;
    reusedMemory: number;
    reusedTerminal: number;
    publishedMemory: number;
    publishedTerminal: number;
  };
  workerTransport: {
    commandsSent: number;
    eventsReceived: number;
    readyEventsReceived: number;
    repliesReceived: number;
    frameEventsReceived: number;
    stoppedEventsReceived: number;
    faultEventsReceived: number;
    framesWithMemoryImage: number;
    framesWithTerminalFrameBuffer: number;
    framesWithTerminalSnapshot: number;
    framesWithHardwareSnapshot: number;
  };
  hardwareSurface: {
    snapshotsReceived: number;
    snapshotsPublished: number;
    snapshotsReused: number;
    noOpSnapshots: number;
    outputVersionChanges: number;
    framesWithHardwareSnapshot: number;
    approximatePayloadBytes: number;
    commandRequests: number;
    commandAcceptances: number;
    commandAcknowledgements: number;
    commandRejections: number;
    totalCommandAckLatencyMs: number;
    maxCommandAckLatencyMs: number;
    visibleStateLatencies: number;
    totalVisibleStateLatencyMs: number;
    maxVisibleStateLatencyMs: number;
  };
  terminalRepaint: {
    repaintCount: number;
    fullRedrawCount: number;
    rowPatchCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
    totalAnsiBytes: number;
    totalRowsPatched: number;
  };
  touchLatency: {
    dispatchCount: number;
    totalDispatchDurationMs: number;
    maxDispatchDurationMs: number;
    lastDispatchDurationMs: number;
    visualLatencyCount: number;
    totalVisualLatencyMs: number;
    maxVisualLatencyMs: number;
    lastVisualLatencyMs: number;
  };
  inputProgressAck: {
    requestCount: number;
    acceptedCount: number;
    ackCount: number;
    totalLatencyMs: number;
    maxLatencyMs: number;
    lastLatencyMs: number;
  };
}

const HOST = '127.0.0.1';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function parseArgs(argv: string[]): ProfileIdeRuntimeOptions {
  return {
    json: argv.includes('--json'),
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

async function readIdePerformanceSnapshotFromPage(page: Page): Promise<IdePerformanceSnapshot> {
  return page.evaluate(() => {
    return (
      (window as typeof window & {
        __M68K_IDE_PERF__?: { snapshot?: () => IdePerformanceSnapshot };
      }).__M68K_IDE_PERF__?.snapshot?.() ?? {
        renderStats: [],
        runtimeSync: {
          callCount: 0,
          totalDurationMs: 0,
          maxDurationMs: 0,
          reusedRegisters: 0,
          reusedFlags: 0,
          reusedMemory: 0,
          reusedTerminal: 0,
          publishedMemory: 0,
          publishedTerminal: 0,
        },
        workerTransport: {
          commandsSent: 0,
          eventsReceived: 0,
          readyEventsReceived: 0,
          repliesReceived: 0,
          frameEventsReceived: 0,
          stoppedEventsReceived: 0,
          faultEventsReceived: 0,
          framesWithMemoryImage: 0,
          framesWithTerminalFrameBuffer: 0,
          framesWithTerminalSnapshot: 0,
          framesWithHardwareSnapshot: 0,
        },
        hardwareSurface: {
          snapshotsReceived: 0,
          snapshotsPublished: 0,
          snapshotsReused: 0,
          noOpSnapshots: 0,
          outputVersionChanges: 0,
          framesWithHardwareSnapshot: 0,
          approximatePayloadBytes: 0,
          commandRequests: 0,
          commandAcceptances: 0,
          commandAcknowledgements: 0,
          commandRejections: 0,
          totalCommandAckLatencyMs: 0,
          maxCommandAckLatencyMs: 0,
          visibleStateLatencies: 0,
          totalVisibleStateLatencyMs: 0,
          maxVisibleStateLatencyMs: 0,
        },
        terminalRepaint: {
          repaintCount: 0,
          fullRedrawCount: 0,
          rowPatchCount: 0,
          totalDurationMs: 0,
          maxDurationMs: 0,
          totalAnsiBytes: 0,
          totalRowsPatched: 0,
        },
        touchLatency: {
          dispatchCount: 0,
          totalDispatchDurationMs: 0,
          maxDispatchDurationMs: 0,
          lastDispatchDurationMs: 0,
          visualLatencyCount: 0,
          totalVisualLatencyMs: 0,
          maxVisualLatencyMs: 0,
          lastVisualLatencyMs: 0,
        },
        inputProgressAck: {
          requestCount: 0,
          acceptedCount: 0,
          ackCount: 0,
          totalLatencyMs: 0,
          maxLatencyMs: 0,
          lastLatencyMs: 0,
        },
      }
    );
  });
}

async function waitForTelemetryAdvanceAfterInput(
  page: Page,
  options: {
    trigger: () => Promise<void> | void;
    timeoutMs?: number;
    activeRunMs?: number;
    requireInputProgressAck?: boolean;
    requireTouchDispatch?: boolean;
    requireTouchVisual?: boolean;
  }
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const before = await readIdePerformanceSnapshotFromPage(page);
  let lastSnapshot = before;
  const startedAt = performance.now();

  await Promise.resolve(options.trigger());

  while (performance.now() - startedAt < timeoutMs) {
    const after = await readIdePerformanceSnapshotFromPage(page);
    lastSnapshot = after;
    const acceptedAdvanced =
      options.requireInputProgressAck === false ||
      after.inputProgressAck.acceptedCount > before.inputProgressAck.acceptedCount;
    const ackAdvanced =
      options.requireInputProgressAck === false ||
      after.inputProgressAck.ackCount > before.inputProgressAck.ackCount;
    const frameAdvanced =
      after.workerTransport.frameEventsReceived > before.workerTransport.frameEventsReceived;
    const repaintAdvanced =
      after.terminalRepaint.repaintCount > before.terminalRepaint.repaintCount;
    const touchDispatchAdvanced =
      !options.requireTouchDispatch ||
      after.touchLatency.dispatchCount > before.touchLatency.dispatchCount;
    const touchVisualAdvanced =
      !options.requireTouchVisual ||
      after.touchLatency.visualLatencyCount > before.touchLatency.visualLatencyCount;

    if (
      acceptedAdvanced &&
      ackAdvanced &&
      frameAdvanced &&
      repaintAdvanced &&
      touchDispatchAdvanced &&
      touchVisualAdvanced
    ) {
      if ((options.activeRunMs ?? 0) > 0) {
        await page.waitForTimeout(options.activeRunMs!);
      }
      return;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(
    `Timed out waiting for IDE telemetry to advance after input after ${timeoutMs}ms: ${JSON.stringify(
      {
        inputProgressAck: {
          before: before.inputProgressAck,
          after: lastSnapshot.inputProgressAck,
        },
        frameEvents: {
          before: before.workerTransport.frameEventsReceived,
          after: lastSnapshot.workerTransport.frameEventsReceived,
        },
        terminalRepaints: {
          before: before.terminalRepaint.repaintCount,
          after: lastSnapshot.terminalRepaint.repaintCount,
        },
        touchDispatches: {
          before: before.touchLatency.dispatchCount,
          after: lastSnapshot.touchLatency.dispatchCount,
        },
        touchVisuals: {
          before: before.touchLatency.visualLatencyCount,
          after: lastSnapshot.touchLatency.visualLatencyCount,
        },
      }
    )}`
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const port = await reservePort();
  const baseUrl = `http://${HOST}:${port}`;
  const server = spawn('yarn', ['preview:e2e'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_IDE_AUTOPLAY: 'false',
      WEB_HOST: HOST,
      WEB_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  try {
    await waitForServer(baseUrl, 180_000);
    const browser = await chromium.launch({ headless: true });

    try {
      const scenarios = [
        await profileDesktopScenario(browser, baseUrl),
        await profileMobileScenario(browser, baseUrl),
        await profileHardwareScenario(browser, baseUrl, false),
        await profileHardwareScenario(browser, baseUrl, true),
      ];

      const payload = {
        generatedAt: new Date().toISOString(),
        durationMs: round(performance.now() - startedAt),
        scenarios,
      };

      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log('IDE runtime profile summary');
      for (const scenario of scenarios) {
        console.log(
          `${scenario.title}: intro ${scenario.introElapsedMs}ms, gameplay ${scenario.gameplayElapsedMs}ms, terminal ${scenario.terminalColumns}x${scenario.terminalRows}, shell=${scenario.shellMode}, input=${scenario.inputMode}`
        );
        console.table(scenario.topRenderHotspots);
        console.table([scenario.runtimeSync]);
        console.table([scenario.workerTransport]);
        console.table([scenario.hardwareSurface]);
        console.table([scenario.terminalRepaint]);
        console.table([scenario.touchLatency]);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

const HARDWARE_PROFILE_SOURCE = `ORG $64
IRQ1_VECTOR DC.L IRQ1_HANDLER
ORG $1000
START
  MOVE.B $E00010,D0
  MOVE.B D0,$E00010
  MOVE.B #$7D,$E00000
  MOVE.B #$7F,$E00002
  BRA START
IRQ1_HANDLER
  ADDQ.B #1,IRQ_COUNT
  MOVE.B IRQ_COUNT,$E00010
  RTE
IRQ_COUNT DC.B 0
  END START`;

async function readHeapSize(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const memory = (globalThis.performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }).memory;
    return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
  });
}

async function profileHardwareScenario(
  browser: Browser,
  baseUrl: string,
  compact: boolean
): Promise<IdeRuntimeScenarioSummary> {
  const viewport = compact ? { width: 390, height: 844 } : devices['Desktop Chrome'].viewport;
  const context = await browser.newContext(
    compact ? { ...devices['iPhone 13'], viewport } : { ...devices['Desktop Chrome'] }
  );
  try {
    const page = await prepareInstrumentedPage(context, baseUrl);
    await page.waitForFunction(
      () =>
        typeof (window as typeof window & {
          __M68K_IDE_TEST_CONTROLS__?: { runProgram?: () => void };
        }).__M68K_IDE_TEST_CONTROLS__?.runProgram === 'function',
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(() => {
      (window as typeof window & {
        __M68K_IDE_TEST_CONTROLS__?: { runProgram?: () => void };
      }).__M68K_IDE_TEST_CONTROLS__?.runProgram?.();
    });
    await page.waitForFunction(
      () => {
        const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
        return Boolean(runtime?.controller);
      },
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(async () => {
      const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
      await runtime?.controller?.whenReady?.();
    });
    await page.waitForFunction(
      () =>
        Object.keys(
          (window as typeof window & { emulatorInstance?: any }).emulatorInstance?.getSymbols?.() ?? {}
        ).length > 0,
      undefined,
      { timeout: 30_000 }
    );
    await page.evaluate(() => {
      (window as typeof window & { __M68K_IDE_PERF__?: { reset?: () => void } })
        .__M68K_IDE_PERF__?.reset?.();
    });
    const introStartedAt = performance.now();
    const hardwareTab = page.getByRole('tab', { name: /hardware/i }).last();
    await hardwareTab.click();
    await page.getByTestId('hardware-panel-preview').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(400);
    const introElapsedMs = performance.now() - introStartedAt;
    const heapBefore = await readHeapSize(page);
    const gameplayStartedAt = performance.now();

    await page.evaluate(async (source) => {
      const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
      await runtime?.controller?.requestLoadProgram?.(source, 80, 25);
      await runtime?.controller?.requestRun?.({ delayMs: 0, speedMultiplier: 1 });
    }, HARDWARE_PROFILE_SOURCE);

    for (const bit of [7, 6, 5, 4, 3, 2, 1, 0]) {
      await page.getByRole('switch', { name: `Toggle switch ${bit}` }).click();
      const button = page.getByRole('button', { name: `Push button ${bit}` });
      await button.dispatchEvent('pointerdown');
      await button.dispatchEvent('pointerup');
    }

    await page.getByRole('button', { name: 'Configure addresses' }).click();
    const displayAddress = page.getByLabel('Display base address');
    await displayAddress.fill('00E00100');
    await displayAddress.press('Enter');
    await displayAddress.fill('00E00000');
    await displayAddress.press('Enter');

    await page.getByRole('button', { name: 'Request interrupt level 1' }).click();
    await page.getByLabel('Automatic interrupt interval').fill('50');
    await page.getByLabel('Automatic interrupt level 1').check();
    await page.waitForTimeout(1_000);
    await page.getByLabel('Automatic interrupt level 1').uncheck();
    await page.evaluate(async () => {
      const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
      await runtime?.controller?.requestCancelAutomaticInterrupts?.();
      await runtime?.controller?.requestPause?.();
    });
    const beforeCancelSnapshot = await readIdePerformanceSnapshotFromPage(page);
    await page.waitForTimeout(300);
    const afterCancelSnapshot = await readIdePerformanceSnapshotFromPage(page);
    const gameplayElapsedMs = performance.now() - gameplayStartedAt;
    const heapAfter = await readHeapSize(page);

    return await buildScenarioSummary(page, {
      id: compact ? 'compact-hardware-runtime' : 'desktop-hardware-runtime',
      title: compact ? 'Compact Hardware Runtime' : 'Desktop Hardware Runtime',
      viewport,
      introElapsedMs,
      gameplayElapsedMs,
      heapGrowthBytes:
        heapBefore === null || heapAfter === null ? null : Math.max(0, heapAfter - heapBefore),
      postCancelFrameDelta:
        afterCancelSnapshot.workerTransport.frameEventsReceived -
        beforeCancelSnapshot.workerTransport.frameEventsReceived,
    });
  } finally {
    await context.close();
  }
}

async function profileDesktopScenario(
  browser: Browser,
  baseUrl: string
): Promise<IdeRuntimeScenarioSummary> {
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
  });

  try {
    const page = await prepareInstrumentedPage(context, baseUrl);
    const introStartedAt = performance.now();
    await loadNibblesFixture(page, { useFileExplorer: true, speed: '1', navigate: false });
    await waitForIntro(page, { expectTouchCopy: false, timeoutMs: 60_000 });
    const easyTarget = await resolveMenuTouchTarget(page, 'EASY');
    const introElapsedMs = performance.now() - introStartedAt;

    const gameplayStartedAt = performance.now();
    await scheduleDeferredGameplayInput(page, ['ArrowDown'], ['SCORE:', 'S:']);
    await waitForTelemetryAdvanceAfterInput(page, {
      trigger: () =>
        startGameplayFromIntroTouch(page, {
          row: easyTarget.row,
          col: easyTarget.col,
          hudMarker: ['SCORE:', 'S:'],
          gameplayTimeoutMs: 60_000,
          dispatchStrategy: 'runtime',
        }),
      triggerTimeoutMs: 60_000,
      timeoutMs: 12_000,
      activeRunMs: 1_200,
      requireInputProgressAck: false,
    });
    const gameplayElapsedMs = performance.now() - gameplayStartedAt;

    return await buildScenarioSummary(page, {
      id: 'desktop-nibbles-runtime',
      title: 'Desktop Nibbles Runtime',
      viewport: devices['Desktop Chrome'].viewport,
      introElapsedMs,
      gameplayElapsedMs,
    });
  } finally {
    await context.close();
  }
}

async function profileMobileScenario(
  browser: Browser,
  baseUrl: string
): Promise<IdeRuntimeScenarioSummary> {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport,
  });

  try {
    const page = await prepareInstrumentedPage(context, baseUrl);
    const introStartedAt = performance.now();
    await loadNibblesFixture(page, { useFileExplorer: false, speed: '8', navigate: false });
    await waitForIntro(page, { expectTouchCopy: true, timeoutMs: 60_000 });
    const easyTarget = await resolveMenuTouchTarget(page, 'EASY');
    const introElapsedMs = performance.now() - introStartedAt;

    const gameplayStartedAt = performance.now();
    await startGameplayFromIntroTouch(page, {
      row: easyTarget.row,
      col: easyTarget.col,
      hudMarker: 'Lv:',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });
    await waitForTelemetryAdvanceAfterInput(page, {
      trigger: () => touchTerminalRelativeDirection(page, 'right'),
      timeoutMs: 8_000,
      activeRunMs: 1_200,
      requireTouchDispatch: true,
      requireTouchVisual: true,
    });
    const gameplayElapsedMs = performance.now() - gameplayStartedAt;

    return await buildScenarioSummary(page, {
      id: 'mobile-nibbles-runtime',
      title: 'Mobile Nibbles Runtime',
      viewport,
      introElapsedMs,
      gameplayElapsedMs,
    });
  } finally {
    await context.close();
  }
}

async function resolveMenuTouchTarget(
  page: Page,
  label: string
): Promise<{ row: number; col: number }> {
  const snapshot = await readTerminalSnapshot(page);
  const row = snapshot?.lines.findIndex((line) => line.includes(label)) ?? -1;
  const labelColumn = row >= 0 ? snapshot?.lines[row]?.indexOf(label) ?? -1 : -1;

  if (row < 0 || labelColumn < 0) {
    throw new Error(`Unable to resolve the ${label} menu target from the terminal snapshot`);
  }

  return {
    row,
    col: Math.max(2, labelColumn - 1),
  };
}

async function prepareInstrumentedPage(
  context: BrowserContext,
  baseUrl: string
): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    (window as typeof window & { __M68K_IDE_PERF_ENABLED__?: boolean }).__M68K_IDE_PERF_ENABLED__ = true;
  });
  await page.goto(`${baseUrl}/?ide_perf=1`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.getByTestId('app-container').waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => {
    (window as typeof window & {
      __M68K_IDE_PERF__?: { reset?: () => void };
    }).__M68K_IDE_PERF__?.reset?.();
  });
  return page;
}

async function readRuntimeState(page: Page): Promise<{
  shellMode: string | null;
  inputMode: string | null;
  rows: number | null;
  columns: number | null;
}> {
  return page.evaluate(() => {
    const appContainer = document.querySelector('[data-testid="app-container"]');
    const terminalScreen = document.querySelector('[data-testid="terminal-screen"]');
    const runtime = (window as typeof window & { emulatorInstance?: any }).emulatorInstance;
    const terminalMeta = runtime?.getTerminalMeta?.() ?? null;

    return {
      shellMode: appContainer?.getAttribute('data-shell-mode') ?? null,
      inputMode: terminalScreen?.getAttribute('data-terminal-input-mode') ?? null,
      rows: terminalMeta?.rows ?? null,
      columns: terminalMeta?.columns ?? null,
    };
  });
}

async function buildScenarioSummary(
  page: Page,
  base: {
    id: string;
    title: string;
    viewport: { width: number; height: number };
    introElapsedMs: number;
    gameplayElapsedMs: number;
    heapGrowthBytes?: number | null;
    postCancelFrameDelta?: number | null;
  }
): Promise<IdeRuntimeScenarioSummary> {
  const runtimeState = await readRuntimeState(page);
  const performanceSnapshot = await readIdePerformanceSnapshotFromPage(page);

  return {
    ...base,
    introElapsedMs: round(base.introElapsedMs),
    gameplayElapsedMs: round(base.gameplayElapsedMs),
    heapGrowthBytes: base.heapGrowthBytes ?? null,
    postCancelFrameDelta: base.postCancelFrameDelta ?? null,
    shellMode: runtimeState.shellMode,
    inputMode: runtimeState.inputMode,
    terminalRows: runtimeState.rows,
    terminalColumns: runtimeState.columns,
    topRenderHotspots: performanceSnapshot.renderStats.slice(0, 12).map((stat) => ({
      id: stat.id,
      renderCount: stat.renderCount,
      actualDurationMs: round(stat.actualDurationMs),
      maxActualDurationMs: round(stat.maxActualDurationMs),
    })),
    runtimeSync: {
      callCount: performanceSnapshot.runtimeSync.callCount,
      totalDurationMs: round(performanceSnapshot.runtimeSync.totalDurationMs),
      maxDurationMs: round(performanceSnapshot.runtimeSync.maxDurationMs),
      averageDurationMs:
        performanceSnapshot.runtimeSync.callCount > 0
          ? round(
              performanceSnapshot.runtimeSync.totalDurationMs /
                performanceSnapshot.runtimeSync.callCount
            )
          : 0,
      reusedRegisters: performanceSnapshot.runtimeSync.reusedRegisters,
      reusedFlags: performanceSnapshot.runtimeSync.reusedFlags,
      reusedMemory: performanceSnapshot.runtimeSync.reusedMemory,
      reusedTerminal: performanceSnapshot.runtimeSync.reusedTerminal,
      publishedMemory: performanceSnapshot.runtimeSync.publishedMemory,
      publishedTerminal: performanceSnapshot.runtimeSync.publishedTerminal,
    },
    workerTransport: {
      commandsSent: performanceSnapshot.workerTransport.commandsSent,
      eventsReceived: performanceSnapshot.workerTransport.eventsReceived,
      readyEventsReceived: performanceSnapshot.workerTransport.readyEventsReceived,
      repliesReceived: performanceSnapshot.workerTransport.repliesReceived,
      frameEventsReceived: performanceSnapshot.workerTransport.frameEventsReceived,
      stoppedEventsReceived: performanceSnapshot.workerTransport.stoppedEventsReceived,
      faultEventsReceived: performanceSnapshot.workerTransport.faultEventsReceived,
      framesWithMemoryImage: performanceSnapshot.workerTransport.framesWithMemoryImage,
      framesWithTerminalFrameBuffer:
        performanceSnapshot.workerTransport.framesWithTerminalFrameBuffer,
      framesWithTerminalSnapshot: performanceSnapshot.workerTransport.framesWithTerminalSnapshot,
      framesWithHardwareSnapshot:
        performanceSnapshot.workerTransport.framesWithHardwareSnapshot,
    },
    hardwareSurface: {
      snapshotsReceived: performanceSnapshot.hardwareSurface.snapshotsReceived,
      snapshotsPublished: performanceSnapshot.hardwareSurface.snapshotsPublished,
      snapshotsReused: performanceSnapshot.hardwareSurface.snapshotsReused,
      noOpSnapshots: performanceSnapshot.hardwareSurface.noOpSnapshots,
      outputVersionChanges: performanceSnapshot.hardwareSurface.outputVersionChanges,
      framesWithHardwareSnapshot:
        performanceSnapshot.hardwareSurface.framesWithHardwareSnapshot,
      approximatePayloadBytes: performanceSnapshot.hardwareSurface.approximatePayloadBytes,
      commandRequests: performanceSnapshot.hardwareSurface.commandRequests,
      commandAcceptances: performanceSnapshot.hardwareSurface.commandAcceptances,
      commandAcknowledgements: performanceSnapshot.hardwareSurface.commandAcknowledgements,
      commandRejections: performanceSnapshot.hardwareSurface.commandRejections,
      averageCommandAckLatencyMs:
        performanceSnapshot.hardwareSurface.commandAcknowledgements > 0
          ? round(
              performanceSnapshot.hardwareSurface.totalCommandAckLatencyMs /
                performanceSnapshot.hardwareSurface.commandAcknowledgements
            )
          : 0,
      maxCommandAckLatencyMs: round(performanceSnapshot.hardwareSurface.maxCommandAckLatencyMs),
      visibleStateLatencies: performanceSnapshot.hardwareSurface.visibleStateLatencies,
      averageVisibleStateLatencyMs:
        performanceSnapshot.hardwareSurface.visibleStateLatencies > 0
          ? round(
              performanceSnapshot.hardwareSurface.totalVisibleStateLatencyMs /
                performanceSnapshot.hardwareSurface.visibleStateLatencies
            )
          : 0,
      maxVisibleStateLatencyMs: round(
        performanceSnapshot.hardwareSurface.maxVisibleStateLatencyMs
      ),
    },
    terminalRepaint: {
      repaintCount: performanceSnapshot.terminalRepaint.repaintCount,
      fullRedrawCount: performanceSnapshot.terminalRepaint.fullRedrawCount,
      rowPatchCount: performanceSnapshot.terminalRepaint.rowPatchCount,
      totalDurationMs: round(performanceSnapshot.terminalRepaint.totalDurationMs),
      maxDurationMs: round(performanceSnapshot.terminalRepaint.maxDurationMs),
      averageDurationMs:
        performanceSnapshot.terminalRepaint.repaintCount > 0
          ? round(
              performanceSnapshot.terminalRepaint.totalDurationMs /
                performanceSnapshot.terminalRepaint.repaintCount
            )
          : 0,
      totalAnsiBytes: performanceSnapshot.terminalRepaint.totalAnsiBytes,
      totalRowsPatched: performanceSnapshot.terminalRepaint.totalRowsPatched,
    },
    touchLatency: {
      dispatchCount: performanceSnapshot.touchLatency.dispatchCount,
      totalDispatchDurationMs: round(performanceSnapshot.touchLatency.totalDispatchDurationMs),
      maxDispatchDurationMs: round(performanceSnapshot.touchLatency.maxDispatchDurationMs),
      averageDispatchDurationMs:
        performanceSnapshot.touchLatency.dispatchCount > 0
          ? round(
              performanceSnapshot.touchLatency.totalDispatchDurationMs /
                performanceSnapshot.touchLatency.dispatchCount
            )
          : 0,
      lastDispatchDurationMs: round(performanceSnapshot.touchLatency.lastDispatchDurationMs),
      visualLatencyCount: performanceSnapshot.touchLatency.visualLatencyCount,
      totalVisualLatencyMs: round(performanceSnapshot.touchLatency.totalVisualLatencyMs),
      maxVisualLatencyMs: round(performanceSnapshot.touchLatency.maxVisualLatencyMs),
      averageVisualLatencyMs:
        performanceSnapshot.touchLatency.visualLatencyCount > 0
          ? round(
              performanceSnapshot.touchLatency.totalVisualLatencyMs /
                performanceSnapshot.touchLatency.visualLatencyCount
            )
          : 0,
      lastVisualLatencyMs: round(performanceSnapshot.touchLatency.lastVisualLatencyMs),
    },
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore startup races.
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for preview server at ${url}`);
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
        server.close(() => reject(new Error('Failed to reserve an ephemeral preview port')));
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
