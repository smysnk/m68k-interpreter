import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MULTI_DEVICE_SOURCE = readFileSync(
  resolve(process.cwd(), 'packages/ide/src/fixtures/hardware-multi-device.asm'),
  'utf8'
);
const INTERRUPT_SOURCE = readFileSync(
  resolve(process.cwd(), 'packages/ide/src/fixtures/hardware-interrupts.asm'),
  'utf8'
).replaceAll('$E00010', '$E00040');

interface IdeTestControls {
  loadSource?: (source: string) => void;
  runProgram?: () => void;
  setPanelPreset?: (value: 'hardware-lab') => void;
  setWorkspaceTab?: (value: 'hardware') => void;
}

async function openHardwareLab(page: Page, compact = false): Promise<void> {
  await page.goto('/?ide_perf=1');
  await page.waitForFunction(
    () =>
      typeof (window as typeof window & {
        __M68K_IDE_TEST_CONTROLS__?: IdeTestControls;
      }).__M68K_IDE_TEST_CONTROLS__?.setPanelPreset === 'function'
  );
  await page.evaluate(() => {
    (window as typeof window & {
      __M68K_IDE_TEST_CONTROLS__?: IdeTestControls;
    }).__M68K_IDE_TEST_CONTROLS__?.setPanelPreset?.('hardware-lab');
  });
  if (compact) {
    await page.evaluate(() => {
      (window as typeof window & {
        __M68K_IDE_TEST_CONTROLS__?: IdeTestControls;
      }).__M68K_IDE_TEST_CONTROLS__?.setWorkspaceTab?.('hardware');
    });
    await expect(page.locator('[data-panel-kind="hardware-display"]')).toBeVisible();
    return;
  }
  await expect(page.locator('[data-panel-kind="hardware-display"]')).toHaveCount(1);
  await expect(page.locator('[data-panel-kind="hardware-digital-io"]')).toHaveCount(1);
  await expect(page.locator('[data-panel-kind="hardware-interrupts"]')).toHaveCount(1);
}

async function loadAndRun(
  page: Page,
  source: string,
  expectedSymbol = 'LOOP'
): Promise<void> {
  await page.evaluate((program) => {
    const controls = (window as typeof window & {
      __M68K_IDE_TEST_CONTROLS__?: IdeTestControls;
    }).__M68K_IDE_TEST_CONTROLS__;
    controls?.loadSource?.(program);
    controls?.runProgram?.();
  }, source);
  await page.waitForFunction(
    (symbol) =>
      Object.keys(
        (window as typeof window & {
          emulatorInstance?: { getSymbols?(): Record<string, number> };
        }).emulatorInstance?.getSymbols?.() ?? {}
      ).includes(symbol),
    expectedSymbol
  );
}

async function selectTheme(page: Page, theme: 'M68K Dark' | 'M68K Light'): Promise<void> {
  await page.getByRole('button', { name: /open app menu/i }).click();
  await page.getByRole('menuitem', { name: /style/i }).click();
  await page.getByRole('menuitem', { name: theme }).click();
  await expect(page.getByTestId('app-container')).toHaveAttribute(
    'data-theme',
    theme === 'M68K Dark' ? 'dark' : 'light'
  );
}

async function selectColumnCount(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: /open view menu/i }).click();
  await page.getByRole('menuitem', { name: 'Columns' }).click();
  await page.getByRole('menuitemradio', { name: `${count} column${count === 1 ? '' : 's'}` }).click();
}

async function commitAddress(
  panel: Locator,
  label: string,
  hexadecimalAddress: string
): Promise<void> {
  const input = panel.getByRole('textbox', { name: `${label} address` });
  await input.fill(hexadecimalAddress);
  await input.press('Enter');
  await expect(input).toHaveValue(hexadecimalAddress.toUpperCase().padStart(8, '0'));
}

async function assertAlignedMatrix(panel: Locator): Promise<void> {
  const matrix = panel.getByTestId('hardware-io-matrix');
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
      expect(
        Math.abs(
          columnGeometry.rows[rowIndex][column].x -
            columnGeometry.rows[0][column].x
        )
      ).toBeLessThan(1);
      expect(
        Math.abs(
          columnGeometry.rows[rowIndex][column].width -
            columnGeometry.rows[0][column].width
        )
      ).toBeLessThan(1);
    }
  }
  expect(columnGeometry.scrollWidth).toBeLessThanOrEqual(
    columnGeometry.clientWidth + 1
  );
}

test.describe('live EASy68K hardware panels', () => {
  test('keeps multiple visible address mappings independent', async ({ page }, testInfo) => {
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await openHardwareLab(page);

    const displayPanels = page.locator('[data-panel-kind="hardware-display"]');
    const digitalPanels = page.locator('[data-panel-kind="hardware-digital-io"]');
    await displayPanels
      .first()
      .getByRole('button', { name: 'Duplicate Seven-segment display' })
      .click();
    await digitalPanels
      .first()
      .getByRole('button', { name: 'Duplicate LEDs / Switches / Buttons' })
      .click();
    await expect(displayPanels).toHaveCount(2);
    await expect(digitalPanels).toHaveCount(2);

    await commitAddress(displayPanels.nth(0), 'Display base', '00E00000');
    await commitAddress(displayPanels.nth(1), 'Display base', '00E00020');
    await commitAddress(digitalPanels.nth(0), 'LED', '00E00040');
    await commitAddress(digitalPanels.nth(0), 'Switch', '00E00040');
    await commitAddress(digitalPanels.nth(0), 'Button', '00E00042');
    await commitAddress(digitalPanels.nth(1), 'LED', '00E00050');
    await commitAddress(digitalPanels.nth(1), 'Switch', '00E00050');
    await commitAddress(digitalPanels.nth(1), 'Button', '00E00052');

    await assertAlignedMatrix(digitalPanels.nth(0));
    await assertAlignedMatrix(digitalPanels.nth(1));
    await loadAndRun(page, MULTI_DEVICE_SOURCE);

    await expect(
      displayPanels.nth(0).getByRole('img', { name: 'Display digit 1, pattern 0x3F' })
    ).toBeVisible();
    await expect(
      displayPanels.nth(1).getByRole('img', { name: 'Display digit 1, pattern 0x06' })
    ).toBeVisible();

    await digitalPanels.nth(0).getByRole('switch', { name: 'Toggle switch 7' }).click();
    await expect(
      digitalPanels.nth(0).getByRole('img', { name: 'LED output 0x80' })
    ).toBeVisible();
    await expect(
      digitalPanels.nth(1).getByRole('img', { name: 'LED output 0x00' })
    ).toBeVisible();

    await digitalPanels.nth(1).getByRole('switch', { name: 'Toggle switch 0' }).click();
    await expect(
      digitalPanels.nth(1).getByRole('img', { name: 'LED output 0x01' })
    ).toBeVisible();
    await expect(
      digitalPanels.nth(0).getByRole('img', { name: 'LED output 0x80' })
    ).toBeVisible();

    const deviceAButton = digitalPanels.nth(0).getByRole('button', { name: 'Push button 0' });
    const deviceBButton = digitalPanels.nth(1).getByRole('button', { name: 'Push button 0' });
    await deviceBButton.dispatchEvent('pointerdown');
    await expect(deviceBButton).toHaveAttribute('aria-pressed', 'true');
    await expect(deviceAButton).toHaveAttribute('aria-pressed', 'false');
    await deviceBButton.dispatchEvent('pointerup');

    await loadAndRun(page, INTERRUPT_SOURCE, 'IRQ7_HANDLER');
    const interruptPanel = page.locator('[data-panel-kind="hardware-interrupts"]');
    await interruptPanel
      .getByRole('button', { name: 'Request interrupt level 7' })
      .click();
    await expect(
      digitalPanels.nth(0).getByRole('img', { name: 'LED output 0x07' })
    ).toBeVisible();
    await interruptPanel
      .getByRole('spinbutton', { name: 'Automatic interrupt interval' })
      .fill('50');
    const automaticIrq7 = interruptPanel.getByRole('checkbox', {
      name: 'Automatic interrupt level 7',
    });
    await automaticIrq7.check();
    await expect
      .poll(() =>
        digitalPanels.nth(0).locator('.hardware-io-led-row').getAttribute('aria-label')
      )
      .not.toBe('LED output 0x07');
    await automaticIrq7.uncheck();

    const conflictingDisplayAddress = displayPanels
      .nth(1)
      .getByRole('textbox', { name: 'Display base address' });
    await conflictingDisplayAddress.fill('00E00000');
    await conflictingDisplayAddress.press('Enter');
    await expect(conflictingDisplayAddress).toHaveAttribute('aria-invalid', 'true');
    await expect(conflictingDisplayAddress).toHaveValue('00E00020');

    const deviceIds = await page
      .locator('[data-hardware-device-id]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-hardware-device-id'))
      );
    expect(new Set(deviceIds).size).toBe(4);

    await selectTheme(page, 'M68K Dark');
    await testInfo.attach('independent-hardware-panels-dark-docked', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await selectTheme(page, 'M68K Light');
    await testInfo.attach('independent-hardware-panels-light-docked', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await digitalPanels
      .nth(1)
      .getByRole('button', { name: 'Float LEDs / Switches / Buttons' })
      .click();
    await expect(
      page.locator('.floating-panel-window [data-panel-kind="hardware-digital-io"]')
    ).toBeVisible();
    await testInfo.attach('independent-hardware-panels-light-floating', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await digitalPanels
      .nth(1)
      .getByRole('button', { name: 'Dock LEDs / Switches / Buttons' })
      .click();

    await selectColumnCount(page, 1);
    await expect(page.locator('[data-panel-column-id]')).toHaveCount(1);
    await testInfo.attach('independent-hardware-panels-light-one-column', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator('[data-panel-kind="hardware-display"]')).toHaveCount(2);
    await expect(page.locator('[data-panel-kind="hardware-digital-io"]')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('[data-panel-kind="hardware-digital-io"]')
          .getByRole('textbox', { name: 'Button address' })
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value)
          )
      )
      .toContain('00E00052');
    expect(browserErrors).toEqual([]);
  });

  test('keeps the digital matrix usable in the compact Hardware Lab', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHardwareLab(page, true);
    await page.getByRole('tab', { name: 'LEDs / Switches / Buttons' }).click();
    const digitalPanel = page.locator('[data-panel-kind="hardware-digital-io"]');
    await expect(digitalPanel).toBeVisible();
    await assertAlignedMatrix(digitalPanel);
    await testInfo.attach('hardware-panels-compact', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
