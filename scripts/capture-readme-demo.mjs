import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const rootDir = process.cwd();
const baseUrl = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173/';
const outputDir = path.resolve(rootDir, '.test-results/readme-demo-video');
const finalMp4Path = path.resolve(rootDir, 'assets/m68k-interpreter-demo.mp4');
const finalPreviewPath = path.resolve(rootDir, 'assets/m68k-interpreter-demo.gif');
const palettePath = path.resolve(outputDir, 'preview-palette.png');
const trimStartSeconds = process.env.DEMO_TRIM_START_SECONDS || '0.45';
const viewport = { width: 1440, height: 810 };
const skipToNibbles = process.env.DEMO_SKIP_TO_NIBBLES === '1';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
}

function videoDuration(filePath) {
  return Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { encoding: 'utf8' }
    ).trim()
  );
}

async function installDemoChrome(page) {
  await page.evaluate(() => {
    if (document.querySelector('#readme-demo-url')) return;

    const url = document.createElement('div');
    url.id = 'readme-demo-url';
    url.textContent = 'smysnk.com/m68k-interpreter';
    Object.assign(url.style, {
      position: 'fixed',
      zIndex: '2147483646',
      top: '68px',
      right: '18px',
      padding: '8px 13px',
      border: '1px solid rgba(96, 165, 250, 0.58)',
      borderRadius: '999px',
      background: 'rgba(4, 12, 24, 0.9)',
      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.32)',
      color: '#dbeafe',
      font: '700 13px/1.15 ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '0.02em',
      pointerEvents: 'none',
    });

    const chapter = document.createElement('div');
    chapter.id = 'readme-demo-chapter';
    chapter.textContent = 'A configurable Motorola 68000 workspace';
    Object.assign(chapter.style, {
      position: 'fixed',
      zIndex: '2147483646',
      left: '50%',
      bottom: '42px',
      transform: 'translateX(-50%)',
      maxWidth: 'min(880px, calc(100vw - 48px))',
      padding: '10px 18px',
      border: '1px solid rgba(148, 163, 184, 0.4)',
      borderRadius: '10px',
      background: 'rgba(3, 9, 18, 0.9)',
      boxShadow: '0 14px 36px rgba(0, 0, 0, 0.4)',
      color: '#f8fafc',
      font: '700 19px/1.3 Inter, ui-sans-serif, system-ui, sans-serif',
      letterSpacing: '0.01em',
      textAlign: 'center',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 180ms ease, transform 180ms ease',
    });

    const cursor = document.createElement('div');
    cursor.id = 'readme-demo-cursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      zIndex: '2147483647',
      left: '0',
      top: '0',
      width: '22px',
      height: '29px',
      clipPath: 'polygon(0 0, 0 100%, 30% 73%, 48% 100%, 62% 91%, 44% 65%, 78% 65%)',
      background: '#f8fafc',
      filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.85))',
      pointerEvents: 'none',
      opacity: '0',
      transform: 'translate(-2px, -2px)',
    });

    document.body.append(url, chapter, cursor);
  });
}

async function setChapter(page, text, holdMs = 0) {
  await installDemoChrome(page);
  await page.evaluate((nextText) => {
    const chapter = document.querySelector('#readme-demo-chapter');
    if (!(chapter instanceof HTMLElement)) return;
    chapter.style.opacity = '0';
    chapter.style.transform = 'translate(-50%, 5px)';
    window.setTimeout(() => {
      chapter.textContent = nextText;
      chapter.style.opacity = '1';
      chapter.style.transform = 'translate(-50%, 0)';
    }, 190);
  }, text);
  await wait(430 + holdMs);
}

async function moveDemoCursor(page, x, y, durationMs = 420) {
  await installDemoChrome(page);
  await page.evaluate(
    ({ nextX, nextY, duration }) => {
      const cursor = document.querySelector('#readme-demo-cursor');
      if (!(cursor instanceof HTMLElement)) return;
      cursor.style.opacity = '1';
      cursor.style.transition = `left ${duration}ms ease, top ${duration}ms ease, transform 90ms ease`;
      cursor.style.left = `${nextX}px`;
      cursor.style.top = `${nextY}px`;
    },
    { nextX: x, nextY: y, duration: durationMs }
  );
  await page.mouse.move(x, y, { steps: Math.max(6, Math.round(durationMs / 35)) });
  await wait(durationMs);
}

async function moveVisualCursor(page, x, y, durationMs = 420) {
  await installDemoChrome(page);
  await page.evaluate(
    ({ nextX, nextY, duration }) => {
      const cursor = document.querySelector('#readme-demo-cursor');
      if (!(cursor instanceof HTMLElement)) return;
      cursor.style.opacity = '1';
      cursor.style.transition = `left ${duration}ms ease, top ${duration}ms ease, transform 90ms ease`;
      cursor.style.left = `${nextX}px`;
      cursor.style.top = `${nextY}px`;
    },
    { nextX: x, nextY: y, duration: durationMs }
  );
  await wait(durationMs);
}

async function clickWithCursor(page, locator, pauseMs = 330, direct = false) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error('Demo control has no visible bounds.');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (direct) {
    await moveVisualCursor(page, point.x, point.y, 260);
  } else {
    await moveDemoCursor(page, point.x, point.y, 260);
  }
  await page.evaluate(() => {
    const cursor = document.querySelector('#readme-demo-cursor');
    if (cursor instanceof HTMLElement) cursor.style.transform = 'translate(-2px, -2px) scale(0.78)';
  });
  if (direct) {
    await locator.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('Demo target is not interactive.');
      element.click();
    });
  } else {
    await locator.click();
  }
  await wait(90);
  await page.evaluate(() => {
    const cursor = document.querySelector('#readme-demo-cursor');
    if (cursor instanceof HTMLElement) cursor.style.transform = 'translate(-2px, -2px) scale(1)';
  });
  await wait(pauseMs);
}

async function openViewSubmenu(page, name) {
  await clickWithCursor(page, page.getByRole('button', { name: 'Open view menu' }), 160);
  const item = page.getByRole('menuitem', { name, exact: true });
  await clickWithCursor(page, item, 120, true);
  await wait(260);
}

async function setColumnCount(page, count) {
  await openViewSubmenu(page, 'Columns');
  await clickWithCursor(
    page,
    page.getByRole('menuitemradio', {
      name: `${count} ${count === 1 ? 'column' : 'columns'}`,
    }),
    600,
    true
  );
}

async function addPanel(page, title) {
  await openViewSubmenu(page, 'Add Panel');
  await clickWithCursor(
    page,
    page.getByRole('menuitem', { name: `Add ${title} panel` }),
    560,
    true
  );
}

async function applyLayout(page, name) {
  await openViewSubmenu(page, 'Layouts');
  await clickWithCursor(
    page,
    page.getByRole('menuitem', { name: `Apply ${name} layout` }),
    650,
    true
  );
}

async function dragPanelToEmptyColumn(page, title, columnIndex) {
  const panel = page.locator('.panel-frame', {
    has: page.getByRole('heading', { name: title, exact: true }),
  });
  const heading = panel.getByRole('heading', { name: title, exact: true });
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error(`${title} panel heading has no visible bounds.`);

  const start = {
    x: headingBox.x + Math.min(headingBox.width / 2, 110),
    y: headingBox.y + headingBox.height / 2,
  };
  await moveDemoCursor(page, start.x, start.y, 320);
  await page.mouse.down();
  await page.mouse.move(start.x + 14, start.y + 7, { steps: 5 });
  await page.locator('.panel-drag-overlay').waitFor({ state: 'visible', timeout: 10_000 });

  const target = page.locator(
    `[data-panel-dock-target][data-panel-column-index="${columnIndex}"][data-panel-dock-relation="empty"]`
  );
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error(`Column ${columnIndex + 1} dock target has no visible bounds.`);
  const destination = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await page.evaluate(
    ({ nextX, nextY }) => {
      const cursor = document.querySelector('#readme-demo-cursor');
      if (!(cursor instanceof HTMLElement)) return;
      cursor.style.transition = 'left 900ms ease, top 900ms ease';
      cursor.style.left = `${nextX}px`;
      cursor.style.top = `${nextY}px`;
    },
    { nextX: destination.x, nextY: destination.y }
  );
  await page.mouse.move(destination.x, destination.y, { steps: 24 });
  await wait(900);
  await target.waitFor({ state: 'visible' });
  await wait(700);
  await page.mouse.up();
  await wait(950);
}

async function openFixture(page, fileName) {
  const openExplorer = page.getByRole('button', { name: 'Open file explorer' });
  if (await openExplorer.isVisible().catch(() => false)) {
    const explorerBox = await openExplorer.boundingBox();
    if (!explorerBox) throw new Error('File explorer control has no visible bounds.');
    await moveDemoCursor(
      page,
      explorerBox.x + explorerBox.width / 2,
      explorerBox.y + explorerBox.height / 2,
      250
    );
    await openExplorer.hover();
    await wait(420);
  }
  const file = page.getByRole('button', { name: new RegExp(`${fileName.replace('.', '\\.')}\\s`) });
  await clickWithCursor(page, file, 480, true);
  await moveDemoCursor(page, viewport.width / 2, 34, 260);
  await wait(260);
}

async function runProgram(page) {
  await clickWithCursor(page, page.getByRole('button', { name: 'Run program' }), 720);
}

async function readTerminalText(page) {
  return page.getByTestId('terminal-screen').evaluate((element) =>
    Array.from(element.querySelectorAll('.retro-lcd__line'))
      .map((line) =>
        Array.from(line.querySelectorAll('.retro-lcd__cell'))
          .map((cell) => (cell.textContent === '\u00a0' ? ' ' : (cell.textContent ?? '')))
          .join('')
      )
      .join('\n')
  );
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.dirname(finalMp4Path), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport,
  colorScheme: 'dark',
  recordVideo: {
    dir: outputDir,
    size: viewport,
  },
});
const page = await context.newPage();

await page.addInitScript(() => {
  window.localStorage.clear();
});

try {
  await page.goto(new URL('/?ide_perf=1', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.getByTestId('panel-workspace').waitFor({ state: 'visible', timeout: 30_000 });
  await installDemoChrome(page);
  if (!skipToNibbles) {
    await setChapter(page, 'A configurable Motorola 68000 workspace', 1_050);

    await applyLayout(page, 'Debug');
    await setChapter(page, 'Display modes with one to four configurable columns', 320);
    await openViewSubmenu(page, 'Columns');
    await wait(1_050);
    await clickWithCursor(page, page.getByRole('menuitemradio', { name: '4 columns' }), 750, true);

    await setChapter(page, 'Grab any panel header and move it freely', 260);
    await dragPanelToEmptyColumn(page, 'Screen', 3);
    await setChapter(page, 'Highlighted targets make docking deliberate', 680);
    await addPanel(page, 'Hardware I/O');
    await wait(1_000);

    await setChapter(page, 'Live assembly code beside the EASy68K I/O Board', 300);
    await applyLayout(page, 'Code and Run');
    await clickWithCursor(page, page.getByRole('button', { name: 'Close Screen' }), 260);
    await clickWithCursor(page, page.getByRole('button', { name: 'Close Registers' }), 260);
    await addPanel(page, 'Hardware I/O');
    await openFixture(page, 'hardware-led-switches.asm');
    await runProgram(page);

    await setChapter(page, 'Switch reads are mirrored to the LED latch at $E00010', 240);
    for (const bit of [7, 5, 2, 0]) {
      await clickWithCursor(page, page.getByRole('switch', { name: `Toggle switch ${bit}` }), 470);
    }
    await page.getByRole('img', { name: 'LED output 0xA5' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    await wait(950);

    await setChapter(page, 'Active-low push buttons are live inputs too', 180);
    await openFixture(page, 'hardware-buttons.asm');
    await runProgram(page);
    const pushButton = page.getByRole('button', { name: 'Push button 0' });
    const pushButtonBox = await pushButton.boundingBox();
    if (!pushButtonBox) throw new Error('Hardware button has no visible bounds.');
    await moveDemoCursor(
      page,
      pushButtonBox.x + pushButtonBox.width / 2,
      pushButtonBox.y + pushButtonBox.height / 2,
      260
    );
    await pushButton.dispatchEvent('pointerdown');
    await wait(850);
    await pushButton.dispatchEvent('pointerup');
    await wait(700);

    await setChapter(page, 'Eight memory-mapped seven-segment displays', 180);
    await openFixture(page, 'hardware-seven-segment.asm');
    await runProgram(page);
    await page.getByRole('img', { name: 'Display digit 1, pattern 0x7D' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    await wait(1_650);
  }

  await setChapter(page, 'Nibbles — the bundled 2007 assembly game', 240);
  await openFixture(page, 'nibbles.asm');
  await applyLayout(page, 'Terminal Focus');
  const speed = page.getByLabel('Speed (x)');
  await speed.fill('8');
  await runProgram(page);
  await page.waitForFunction(
    async () => {
      const element = document.querySelector('[data-testid="terminal-screen"]');
      if (!element) return false;
      const text = Array.from(element.querySelectorAll('.retro-lcd__cell'))
        .map((cell) => cell.textContent ?? '')
        .join('');
      return text.includes('SELECT DIFFICULTY');
    },
    null,
    { timeout: 60_000 }
  );
  await wait(1_350);

  const terminalViewport = page.locator('[data-testid="terminal-screen"] .retro-lcd__viewport');
  await terminalViewport.focus();
  await page.evaluate(() => {
    window.__M68K_DEMO_GAMEPLAY_PAUSED__ = false;
    const interval = window.setInterval(() => {
      const runtimeLines = window.emulatorInstance?.getTerminalLines?.();
      const element = document.querySelector('[data-testid="terminal-screen"]');
      const lines =
        runtimeLines ??
        (element
          ? Array.from(element.querySelectorAll('.retro-lcd__line')).map((line) =>
              Array.from(line.querySelectorAll('.retro-lcd__cell'))
                .map((cell) => (cell.textContent === '\u00a0' ? ' ' : (cell.textContent ?? '')))
                .join('')
            )
          : []);
      const hasHud = lines.some((line) => /\bSCORE:\s*\d/u.test(line) || /^\s*S:\s*\d/u.test(line));
      if (!hasHud) return;
      window.clearInterval(interval);
      const controller = window.emulatorInstance?.controller;
      void controller?.requestPause?.().then(() => {
        window.__M68K_DEMO_GAMEPLAY_PAUSED__ = true;
      });
    }, 8);
  });
  await terminalViewport.click();
  await page.evaluate(async () => {
    const controller = window.emulatorInstance?.controller;
    if (!controller) throw new Error('Nibbles runtime controller is unavailable.');
    await controller.requestQueueInput('s');
    await controller.requestResume({ delayMs: 0, speedMultiplier: 8 });
  });
  await wait(120);
  await page.evaluate(async () => {
    const controller = window.emulatorInstance?.controller;
    if (!controller) throw new Error('Nibbles runtime controller is unavailable.');
    await controller.requestQueueInput(0x0d);
    await controller.requestResume({ delayMs: 0, speedMultiplier: 8 });
  });
  try {
    await page.waitForFunction(() => window.__M68K_DEMO_GAMEPLAY_PAUSED__ === true, null, {
      timeout: skipToNibbles ? 12_000 : 60_000,
    });
  } catch (error) {
    const debugState = await page.evaluate(() => ({
      executionState: window.__M68K_IDE_PERF__?.snapshot?.().execution,
      runtimeText:
        window.emulatorInstance?.getTerminalLines?.().join('\n') ??
        window.emulatorInstance?.getTerminalText?.() ??
        null,
      waitingForInput: window.emulatorInstance?.isWaitingForInput?.() ?? null,
      halted: window.emulatorInstance?.isHalted?.() ?? null,
    }));
    console.error(JSON.stringify(debugState, null, 2));
    throw error;
  }
  await page.evaluate(async () => {
    await window.emulatorInstance?.controller?.requestSnapshot?.();
  });
  await wait(360);
  const gameplayText = await readTerminalText(page);
  const runtimeGameplayText = await page.evaluate(
    () =>
      window.emulatorInstance?.getTerminalLines?.().join('\n') ??
      window.emulatorInstance?.getTerminalText?.() ??
      ''
  );
  if (!/\bSCORE:\s*\d|^\s*S:\s*\d/mu.test(`${gameplayText}\n${runtimeGameplayText}`)) {
    throw new Error('Demo capture never reached the Nibbles gameplay HUD.');
  }
  await setChapter(page, 'Play it now at smysnk.com/m68k-interpreter', 120);

  for (const [key, delay] of [
    ['ArrowRight', 700],
    ['ArrowDown', 780],
    ['ArrowLeft', 700],
    ['ArrowUp', 780],
  ]) {
    const input = {
      ArrowRight: 'd',
      ArrowDown: 's',
      ArrowLeft: 'a',
      ArrowUp: 'w',
    }[key];
    await page.evaluate(async (nextInput) => {
      const controller = window.emulatorInstance?.controller;
      if (!controller) throw new Error('Nibbles runtime controller is unavailable.');
      await controller.requestQueueInput(nextInput);
      await controller.requestResume?.();
      await controller.requestPulseExecution?.(2);
    }, input);
    await wait(delay);
    await page.evaluate(async () => {
      await window.emulatorInstance?.controller?.requestPause?.();
    });
    await wait(120);
  }
  await wait(650);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const capturedVideo = fs
  .readdirSync(outputDir)
  .filter((entry) => entry.endsWith('.webm'))
  .map((entry) => path.join(outputDir, entry))
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];

if (!capturedVideo) throw new Error('No recorded demo video was produced.');

runFfmpeg([
  '-ss',
  trimStartSeconds,
  '-i',
  capturedVideo,
  '-vf',
  `fps=30,scale=${viewport.width}:${viewport.height}:flags=lanczos`,
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '21',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  finalMp4Path,
]);

runFfmpeg([
  '-i',
  finalMp4Path,
  '-vf',
  'fps=8,scale=800:-2:flags=lanczos,palettegen=max_colors=96:stats_mode=diff',
  '-frames:v',
  '1',
  palettePath,
]);

runFfmpeg([
  '-i',
  finalMp4Path,
  '-i',
  palettePath,
  '-lavfi',
  'fps=8,scale=800:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  '-loop',
  '0',
  finalPreviewPath,
]);

const previewLimitBytes = 9_500_000;
if (fs.statSync(finalPreviewPath).size > previewLimitBytes) {
  runFfmpeg([
    '-i',
    finalMp4Path,
    '-vf',
    'fps=6,scale=640:-2:flags=lanczos,palettegen=max_colors=64:stats_mode=diff',
    '-frames:v',
    '1',
    palettePath,
  ]);
  runFfmpeg([
    '-i',
    finalMp4Path,
    '-i',
    palettePath,
    '-lavfi',
    'fps=6,scale=640:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=6:diff_mode=rectangle',
    '-loop',
    '0',
    finalPreviewPath,
  ]);
}

const duration = videoDuration(finalMp4Path);
const mp4Bytes = fs.statSync(finalMp4Path).size;
const previewBytes = fs.statSync(finalPreviewPath).size;
if (!Number.isFinite(duration) || duration < 20) {
  throw new Error(`Demo video is unexpectedly short (${duration.toFixed(2)} seconds).`);
}
if (previewBytes > 10_000_000) {
  throw new Error(`Animated README preview exceeds 10 MB (${previewBytes} bytes).`);
}

console.log(
  JSON.stringify(
    {
      durationSeconds: Number(duration.toFixed(2)),
      mp4: { path: finalMp4Path, bytes: mp4Bytes },
      preview: { path: finalPreviewPath, bytes: previewBytes },
    },
    null,
    2
  )
);
