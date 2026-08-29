import { expect, test, type Page } from '@playwright/test';

async function selectSource(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /open file explorer/i }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('compact source IDE directives', () => {
  test('opens Nibbles as a code-and-register workbench beside the interactive screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await selectSource(page, 'nibbles.asm');

    const columns = page.locator('.panel-column');
    await expect(columns).toHaveCount(2);
    await expect(columns.nth(0).locator('[data-panel-kind="code"]')).toHaveCount(1);
    await expect(columns.nth(0).locator('[data-panel-kind="registers"]')).toHaveCount(1);
    await expect(columns.nth(1).locator('[data-panel-kind="terminal"]')).toHaveCount(1);
    await expect(page.getByTestId('terminal-screen')).toHaveAttribute(
      'data-terminal-focused',
      'true'
    );

    const [leftBounds, rightBounds, codeBounds, registerBounds, terminalBounds] = await Promise.all(
      [
        columns.nth(0).boundingBox(),
        columns.nth(1).boundingBox(),
        page.locator('[data-panel-kind="code"]').boundingBox(),
        page.locator('[data-panel-kind="registers"]').boundingBox(),
        page.locator('[data-panel-kind="terminal"]').boundingBox(),
      ]
    );
    expect(leftBounds).not.toBeNull();
    expect(rightBounds).not.toBeNull();
    expect(codeBounds).not.toBeNull();
    expect(registerBounds).not.toBeNull();
    expect(terminalBounds).not.toBeNull();

    const totalColumnWidth = leftBounds!.width + rightBounds!.width;
    expect(leftBounds!.width / totalColumnWidth).toBeGreaterThan(0.39);
    expect(leftBounds!.width / totalColumnWidth).toBeLessThan(0.43);
    const leftPanelHeight = codeBounds!.height + registerBounds!.height;
    expect(codeBounds!.height / leftPanelHeight).toBeGreaterThan(0.61);
    expect(codeBounds!.height / leftPanelHeight).toBeLessThan(0.67);
    expect(terminalBounds!.height).toBeGreaterThan(leftPanelHeight * 0.98);
  });

  test('applies terminal, multimedia, multi-device, debug, and baseline workspaces', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('[data-source-ide-status]')).toHaveCount(0);
    await expect(page.locator('[data-panel-kind="terminal"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(1);

    await selectSource(page, 'graphics-sound-demo.asm');
    await expect(page.locator('[data-panel-kind="graphics"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="sound"]')).toHaveCount(1);

    await selectSource(page, 'hardware-multi-device.asm');
    await expect(page.locator('[data-panel-kind="hardware-display"]')).toHaveCount(2);
    await expect(page.locator('[data-panel-kind="hardware-digital-io"]')).toHaveCount(2);
    await expect(page.locator('[data-panel-kind="hardware-interrupts"]')).toHaveCount(1);
    await expect(page.getByTestId('hardware-display-source-display-1')).toBeVisible();
    await expect(page.getByTestId('hardware-display-source-display-2')).toBeVisible();
    await expect(page.getByTestId('hardware-digital-io-source-digital-io-1')).toBeVisible();
    await expect(page.getByTestId('hardware-digital-io-source-digital-io-2')).toBeVisible();

    await selectSource(page, 'subroutine-stack.asm');
    await expect(page.getByLabel('Speed (x)')).toHaveValue('0.25');
    await expect(page.locator('.status-pill').filter({ hasText: /^ready$/i })).toBeVisible();

    await selectSource(page, 'scratch.asm');
    await expect(page.locator('[data-source-ide-status]')).toHaveCount(0);
    await expect(page.locator('[data-panel-kind="terminal"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(1);
  });

  test('does not expose source-owned workspace controls in the status bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-source-ide-status]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ignore source configuration' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reapply source configuration' })).toHaveCount(0);
    await expect(page.locator('[data-panel-kind="registers"]')).toHaveCount(1);
  });
});
