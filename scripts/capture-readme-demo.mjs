import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const baseUrl = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.cwd(), '.tmp/readme-demo');
const finalWebmPath = path.resolve(process.cwd(), 'docs/assets/m68k-interpreter-nibbles-demo.webm');
const finalMp4Path = path.resolve(process.cwd(), 'docs/assets/m68k-interpreter-nibbles-demo.mp4');
const persistenceKey = 'm68k.ide.preferences.v1';
const trimmedVideoPath = path.resolve(outputDir, 'trimmed-readme-demo.webm');
const finalPassVideoPath = path.resolve(outputDir, 'final-readme-demo.webm');
const leadingTrimSeconds = process.env.DEMO_TRIM_START_SECONDS || '0.8';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readTerminalText(page) {
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

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.dirname(finalWebmPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  viewport: {
    width: 1600,
    height: 1000,
  },
  colorScheme: 'dark',
  recordVideo: {
    dir: outputDir,
    size: {
      width: 1600,
      height: 1000,
    },
  },
});

const page = await context.newPage();

await page.addInitScript(([key]) => {
  window.localStorage.setItem(
    key,
    JSON.stringify({
      settings: {
        editorTheme: 'M68K_DARK',
        followSystemTheme: false,
        lineNumbers: true,
        engineMode: 'interpreter',
        registerEditRadix: 'hex',
      },
    })
  );
}, [persistenceKey]);

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const terminalTab = page.getByRole('tab', { name: /terminal/i });
  const terminalScreen = page.getByTestId('terminal-screen');
  const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
  const nibblesFileButton = page.getByRole('button', { name: /nibbles\.asm/i });
  const runButton = page.getByRole('button', { name: /run program/i });
  const speedInput = page.getByLabel('Speed (x)');

  await terminalTab.click();
  await terminalScreen.waitFor({ state: 'visible' });
  await wait(450);

  await fileExplorerTab.hover();
  await wait(250);
  await nibblesFileButton.click();
  await wait(350);

  await page.getByRole('tab', { name: /terminal/i }).click();
  await speedInput.fill('14');
  await runButton.click();

  await page.waitForFunction(async () => {
    const element = document.querySelector('[data-testid="terminal-screen"]');
    if (!element) {
      return false;
    }
    const lines = Array.from(element.querySelectorAll('.retro-lcd__line'));
    const text = lines
      .map((line) =>
        Array.from(line.querySelectorAll('.retro-lcd__cell'))
          .map((cell) => {
            const value = cell.textContent ?? '';
            return value === '\u00a0' ? ' ' : value;
          })
          .join('')
      )
      .join('\n');
    return /difficulty/i.test(text) && /movement\s+keys/i.test(text);
  }, null, { timeout: 60_000 });

  await wait(1800);

  await terminalScreen.click();
  await page.keyboard.press('s');
  await wait(120);
  await page.keyboard.press('Enter');

  await page.waitForFunction(async () => {
    const element = document.querySelector('[data-testid="terminal-screen"]');
    if (!element) {
      return false;
    }
    const lines = Array.from(element.querySelectorAll('.retro-lcd__line'));
    const text = lines
      .map((line) =>
        Array.from(line.querySelectorAll('.retro-lcd__cell'))
          .map((cell) => {
            const value = cell.textContent ?? '';
            return value === '\u00a0' ? ' ' : value;
          })
          .join('')
      )
      .join('\n');
    return text.includes('SCORE:');
  }, null, { timeout: 60_000 });

  await wait(500);
  const movementSequence = [
    ['d', 380],
    ['d', 380],
    ['s', 420],
    ['s', 420],
    ['a', 380],
    ['a', 380],
    ['w', 420],
    ['d', 380],
    ['d', 380],
    ['s', 420],
    ['a', 380],
    ['w', 420],
  ];

  for (const [key, delay] of movementSequence) {
    await page.keyboard.press(key);
    await wait(delay);
  }

  await wait(900);

  const terminalText = await readTerminalText(page);
  if (!terminalText.includes('SCORE:')) {
    throw new Error('Demo capture never reached the gameplay HUD.');
  }
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

if (!capturedVideo) {
  throw new Error('No recorded demo video was produced.');
}

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-ss',
    leadingTrimSeconds,
    '-i',
    capturedVideo,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '18',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-row-mt',
    '1',
    '-tile-columns',
    '2',
    '-g',
    '240',
    '-an',
    trimmedVideoPath,
  ],
  {
    stdio: 'ignore',
  }
);

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    trimmedVideoPath,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '16',
    '-b:v',
    '0',
    '-deadline',
    'best',
    '-cpu-used',
    '1',
    '-row-mt',
    '1',
    '-tile-columns',
    '2',
    '-g',
    '240',
    '-an',
    finalPassVideoPath,
  ],
  {
    stdio: 'ignore',
  }
);

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    finalPassVideoPath,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    finalMp4Path,
  ],
  {
    stdio: 'ignore',
  }
);

fs.copyFileSync(finalPassVideoPath, finalWebmPath);
console.log(`Saved demo videos to ${finalWebmPath} and ${finalMp4Path}`);
