import { expect, test, type Page } from '@playwright/test';

interface BallSample {
  centerX: number;
  centerY: number;
  count: number;
  height: number;
  wallPixel: number[];
  width: number;
}

async function readBallSample(canvas: ReturnType<Page['locator']>): Promise<BallSample> {
  return canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext('2d');
    if (!context) throw new Error('Graphics canvas has no 2D context.');
    const image = context.getImageData(0, 0, canvasElement.width, canvasElement.height);
    let minX = canvasElement.width;
    let minY = canvasElement.height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    for (let y = 0; y < canvasElement.height; y += 1) {
      for (let x = 0; x < canvasElement.width; x += 1) {
        const offset = (y * canvasElement.width + x) * 4;
        if (
          image.data[offset] === 251 &&
          image.data[offset + 1] === 191 &&
          image.data[offset + 2] === 36 &&
          image.data[offset + 3] === 255
        ) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count += 1;
        }
      }
    }
    const wallOffset = (40 * canvasElement.width + 40) * 4;
    return {
      centerX: count ? (minX + maxX) / 2 : -1,
      centerY: count ? (minY + maxY) / 2 : -1,
      count,
      height: count ? maxY - minY + 1 : 0,
      wallPixel: Array.from(image.data.slice(wallOffset, wallOffset + 4)),
      width: count ? maxX - minX + 1 : 0,
    };
  });
}

async function openViewMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open app menu/i }).click();
  await page.getByRole('menuitem', { name: /^view$/i }).click();
}

async function addPanel(page: Page, name: 'Graphics' | 'Sound'): Promise<void> {
  await openViewMenu(page);
  await page.getByRole('menuitem', { name: /add panel/i }).click();
  await page.getByRole('menuitem', { name: `Add ${name} panel` }).click();
}

test.describe('Easy68K multimedia workspace', () => {
  test('animates a bouncing ball and sounds wall impacts in coherent duplicated panels', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('easy68k-multimedia-test-ready')) {
        localStorage.clear();
        sessionStorage.setItem('easy68k-multimedia-test-ready', 'true');
      }
      (window as typeof window & { __audioStarts?: number }).__audioStarts = 0;
      class FakeAudioContext {
        state: AudioContextState = 'running';
        destination = {};
        createGain() {
          return { gain: { value: 1 }, connect() {} };
        }
        createBufferSource() {
          return {
            buffer: null,
            loop: false,
            onended: null,
            connect() {},
            start() {
              const scope = window as typeof window & { __audioStarts?: number };
              scope.__audioStarts = (scope.__audioStarts ?? 0) + 1;
            },
            stop() {},
          };
        }
        decodeAudioData() {
          return Promise.resolve({});
        }
        resume() {
          this.state = 'running';
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
      }
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: FakeAudioContext,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /open file explorer/i }).click();
    await page.getByTestId('file-explorer-item-example:graphics-sound-demo.asm').click();

    await openViewMenu(page);
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Easy68K Multimedia layout' }).click();
    await addPanel(page, 'Graphics');
    await addPanel(page, 'Sound');

    await expect(page.locator('[data-panel-kind="graphics"]')).toHaveCount(2);
    await expect(page.locator('[data-panel-kind="sound"]')).toHaveCount(2);
    const graphicsPanels = page.locator('[data-panel-kind="graphics"]');
    await graphicsPanels.nth(0).getByLabel('Graphics scale mode').selectOption('one-to-one');
    await expect(graphicsPanels.nth(1).getByLabel('Graphics scale mode')).toHaveValue('fit');

    await page.getByRole('button', { name: 'Enable audio' }).first().click();
    await page.getByRole('button', { name: /run program/i }).click();
    const firstCanvas = graphicsPanels.nth(0).locator('canvas');
    await expect.poll(async () => (await readBallSample(firstCanvas)).count).toBeGreaterThan(100);
    const firstSample = await readBallSample(firstCanvas);

    await expect
      .poll(async () => {
        const sample = await readBallSample(firstCanvas);
        return Math.hypot(
          sample.centerX - firstSample.centerX,
          sample.centerY - firstSample.centerY
        );
      })
      .toBeGreaterThan(8);

    await expect(page.getByText('Task 75: success')).toHaveCount(2);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __audioStarts?: number }).__audioStarts ?? 0
        )
      )
      .toBeGreaterThanOrEqual(2);

    const samples = await Promise.all([
      readBallSample(graphicsPanels.nth(0).locator('canvas')),
      readBallSample(graphicsPanels.nth(1).locator('canvas')),
    ]);
    for (const sample of samples) {
      expect(sample.centerX).toBeGreaterThanOrEqual(53);
      expect(sample.centerX).toBeLessThanOrEqual(586);
      expect(sample.centerY).toBeGreaterThanOrEqual(53);
      expect(sample.centerY).toBeLessThanOrEqual(426);
      expect(sample.count).toBeGreaterThan(100);
      expect(sample.width).toBeLessThanOrEqual(25);
      expect(sample.height).toBeLessThanOrEqual(25);
      expect(sample.wallPixel).toEqual([56, 189, 248, 255]);
    }

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.status-pill').filter({ hasText: /^ready$/i })).toBeVisible();
    const stoppedSample = await readBallSample(firstCanvas);
    await page.waitForTimeout(250);
    const stillStoppedSample = await readBallSample(firstCanvas);
    expect(stillStoppedSample.centerX).toBe(stoppedSample.centerX);
    expect(stillStoppedSample.centerY).toBe(stoppedSample.centerY);

    await page.getByRole('button', { name: /run program/i }).click();
    await expect
      .poll(async () => {
        const sample = await readBallSample(firstCanvas);
        return Math.hypot(
          sample.centerX - stillStoppedSample.centerX,
          sample.centerY - stillStoppedSample.centerY
        );
      })
      .toBeGreaterThan(8);
    const restartedSample = await readBallSample(firstCanvas);
    expect(restartedSample.centerX).toBeGreaterThanOrEqual(53);
    expect(restartedSample.centerX).toBeLessThanOrEqual(586);
    expect(restartedSample.centerY).toBeGreaterThanOrEqual(53);
    expect(restartedSample.centerY).toBeLessThanOrEqual(426);
  });

  test('shows explicit unavailable states in the Bare machine profile', async ({ page }) => {
    await page.goto('/');
    await openViewMenu(page);
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Easy68K Multimedia layout' }).click();
    await page.getByRole('button', { name: /emulation mode/i }).click();
    await page.getByRole('menuitemradio', { name: 'Bare' }).click();
    await expect(page.getByText('Graphics requires the Easy68K machine profile.')).toBeVisible();
    await expect(page.getByText('Sound requires the Easy68K machine profile.')).toBeVisible();
  });
});
