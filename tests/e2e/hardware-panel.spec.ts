import { expect, test, type Page } from '@playwright/test';

const SOURCE = `ORG $64
IRQ1_VECTOR DC.L IRQ1_HANDLER
ORG $1000
START
  MOVE.B $E00010,D0
  MOVE.B D0,$E00010
  MOVE.B #$7D,$E00000
  BRA START
IRQ1_HANDLER
  ADDQ.B #1,IRQ_COUNT
  MOVE.B IRQ_COUNT,$E00010
  RTE
IRQ_COUNT DC.B 0
  END START`;

interface BrowserRuntime {
  controller?: {
    whenReady(): Promise<void>;
    requestLoadProgram(source: string, columns: number, rows: number): Promise<void>;
    requestRun(config: { delayMs: number; speedMultiplier: number }): Promise<void>;
  };
  getSymbols?(): Record<string, number>;
}

async function initializeRuntime(page: Page): Promise<void> {
  await page.goto('/?ide_perf=1');
  await page.waitForFunction(
    () =>
      typeof (window as typeof window & {
        __M68K_IDE_TEST_CONTROLS__?: { runProgram?: () => void };
      }).__M68K_IDE_TEST_CONTROLS__?.runProgram === 'function'
  );
  await page.evaluate(() => {
    (window as typeof window & {
      __M68K_IDE_TEST_CONTROLS__?: { runProgram?: () => void };
    }).__M68K_IDE_TEST_CONTROLS__?.runProgram?.();
  });
  await page.waitForFunction(
    () =>
      Boolean(
        (window as typeof window & { emulatorInstance?: BrowserRuntime }).emulatorInstance
          ?.controller
      )
  );
  await page.evaluate(async () => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    if (!runtime?.controller) throw new Error('Worker runtime is unavailable');
    await runtime.controller.whenReady();
  });
  await page.waitForFunction(
    () =>
      Object.keys(
        (window as typeof window & { emulatorInstance?: BrowserRuntime }).emulatorInstance
          ?.getSymbols?.() ?? {}
      ).length > 0
  );
  await page.evaluate(async (source) => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    if (!runtime?.controller) throw new Error('Worker runtime is unavailable');
    await runtime.controller.requestLoadProgram(source, 80, 25);
    await runtime.controller.requestRun({ delayMs: 0, speedMultiplier: 1 });
  }, SOURCE);
}

async function assertAlignedMatrix(page: Page): Promise<void> {
  const matrix = page.getByTestId('hardware-io-matrix');
  const columnGeometry = await matrix.evaluate((element) => {
    const selectors = [
      '.hardware-io-switch-row .hardware-io-cell',
      '.hardware-io-led-row .hardware-io-cell',
      '.hardware-io-button-row .hardware-io-cell',
    ];
    return {
      rows: selectors.map((selector) =>
        [...element.querySelectorAll<HTMLElement>(selector)].map((cell) => {
          const rect = cell.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        })
      ),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });

  expect(columnGeometry.rows.every((row) => row.length === 8)).toBe(true);
  for (let rowIndex = 1; rowIndex < columnGeometry.rows.length; rowIndex += 1) {
    for (let column = 0; column < 8; column += 1) {
      expect(Math.abs(columnGeometry.rows[rowIndex][column].x - columnGeometry.rows[0][column].x)).toBeLessThan(1);
      expect(Math.abs(columnGeometry.rows[rowIndex][column].width - columnGeometry.rows[0][column].width)).toBeLessThan(1);
    }
  }
  expect(columnGeometry.scrollWidth).toBeLessThanOrEqual(columnGeometry.clientWidth + 1);
}

test.describe('live EASy68K hardware panel', () => {
  test('drives live I/O and preserves one aligned eight-column desktop matrix', async ({ page }) => {
    await initializeRuntime(page);
    await page.getByRole('tab', { name: 'Hardware' }).last().click();
    await expect(page.getByTestId('hardware-panel-preview')).toBeVisible();
    await assertAlignedMatrix(page);

    await page.getByRole('switch', { name: 'Toggle switch 7' }).click();
    await expect(page.getByRole('img', { name: 'LED output 0x80' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Display digit 1, pattern 0x7D' })).toBeVisible();

    const button = page.getByRole('button', { name: 'Push button 0' });
    await button.dispatchEvent('pointerdown');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.dispatchEvent('pointerup');
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Request interrupt level 1' }).click();
    await expect(page.getByText('IRQ 1 accepted')).toBeVisible();
  });

  test('keeps all columns visible in the compact Hardware workspace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await initializeRuntime(page);
    await page.evaluate(() => {
      (window as typeof window & {
        __M68K_IDE_TEST_CONTROLS__?: { setWorkspaceTab?: (value: 'hardware') => void };
      }).__M68K_IDE_TEST_CONTROLS__?.setWorkspaceTab?.('hardware');
    });
    await expect(page.getByTestId('hardware-panel-preview')).toBeVisible();
    await assertAlignedMatrix(page);
  });
});
