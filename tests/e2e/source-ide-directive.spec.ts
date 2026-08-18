import { expect, test, type Page } from '@playwright/test';

async function selectSource(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /open file explorer/i }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('compact source IDE directives', () => {
  test('applies terminal, multimedia, multi-device, debug, and baseline workspaces', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByText(/source config · terminal-focus/i)).toBeVisible();
    await expect(page.locator('[data-panel-kind="terminal"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(0);

    await selectSource(page, 'graphics-sound-demo.asm');
    await expect(page.getByText(/source config · multimedia/i)).toBeVisible();
    await expect(page.locator('[data-panel-kind="graphics"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="sound"]')).toHaveCount(1);

    await selectSource(page, 'hardware-multi-device.asm');
    await expect(page.getByText(/source config · hardware-lab/i)).toBeVisible();
    await expect(page.locator('[data-panel-kind="hardware-display"]')).toHaveCount(2);
    await expect(page.locator('[data-panel-kind="hardware-digital-io"]')).toHaveCount(2);
    await expect(page.getByTestId('hardware-display-source-display-1')).toBeVisible();
    await expect(page.getByTestId('hardware-display-source-display-2')).toBeVisible();
    await expect(page.getByTestId('hardware-digital-io-source-digital-io-1')).toBeVisible();
    await expect(page.getByTestId('hardware-digital-io-source-digital-io-2')).toBeVisible();

    await selectSource(page, 'subroutine-stack.asm');
    await expect(page.getByText(/source config · debug/i)).toBeVisible();
    await expect(page.getByLabel('Speed (x)')).toHaveValue('0.25');
    await expect(page.locator('.status-pill').filter({ hasText: /^ready$/i })).toBeVisible();

    await selectSource(page, 'scratch.asm');
    await expect(page.locator('[data-source-ide-status]')).toHaveCount(0);
    await expect(page.locator('[data-panel-kind="terminal"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(1);
  });

  test('ignores and reapplies a source-owned workspace without losing the baseline', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/source config · terminal-focus/i)).toBeVisible();

    await page.getByRole('button', { name: 'Ignore source configuration' }).click();
    await expect(page.getByText(/source config ignored/i)).toBeVisible();
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Reapply source configuration' }).click();
    await expect(page.getByText(/source config · terminal-focus/i)).toBeVisible();
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(0);
  });
});
