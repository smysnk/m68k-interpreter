import { expect, type Page } from '@playwright/test';

export async function ignoreBootSourceConfiguration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus === 'function',
    undefined,
    { timeout: 5_000 }
  );
  const initialStatus = await page.evaluate(() =>
    window.__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus()
  );
  if (initialStatus === 'none') return;
  const ignoreButton = page.getByRole('button', { name: 'Ignore source configuration' });
  if (await ignoreButton.isVisible()) {
    await ignoreButton.click();
  } else {
    await page.waitForFunction(
      () =>
        typeof (
          window as typeof window & {
            __M68K_IDE_TEST_CONTROLS__?: { ignoreSourceConfiguration?: () => void };
          }
        ).__M68K_IDE_TEST_CONTROLS__?.ignoreSourceConfiguration === 'function',
      undefined,
      { timeout: 5_000 }
    );
    await page.evaluate(() =>
      (
        window as typeof window & {
          __M68K_IDE_TEST_CONTROLS__?: { ignoreSourceConfiguration?: () => void };
        }
      ).__M68K_IDE_TEST_CONTROLS__?.ignoreSourceConfiguration?.()
    );
  }
  const canReadSourceStatus = await page.evaluate(
    () =>
      typeof (
        window as typeof window & {
          __M68K_IDE_TEST_CONTROLS__?: { getSourceIdeStatus?: () => string };
        }
      ).__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus === 'function'
  );
  if (canReadSourceStatus) {
    await page.waitForFunction(
      () =>
        (
          window as typeof window & {
            __M68K_IDE_TEST_CONTROLS__?: { getSourceIdeStatus?: () => string };
          }
        ).__M68K_IDE_TEST_CONTROLS__?.getSourceIdeStatus?.() === 'ignored'
    );
  } else {
    await expect(page.getByText(/source config ignored/i)).toBeVisible();
  }
}

export async function openBaselineIde(page: Page, url = '/?ide_perf=1'): Promise<void> {
  await page.goto(url);
  await ignoreBootSourceConfiguration(page);
}
