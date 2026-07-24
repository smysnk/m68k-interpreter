import { expect, test, type Locator, type Page } from '@playwright/test';

async function beginPointerDrag(page: Page, activator: Locator): Promise<void> {
  const box = await activator.boundingBox();
  expect(box).not.toBeNull();
  const start = {
    x: box!.x + Math.min(box!.width / 2, 120),
    y: box!.y + box!.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 3, start.y + 2);
  await expect(page.locator('.panel-drag-overlay')).toHaveCount(0);
  await page.mouse.move(start.x + 12, start.y + 6);
  await expect(page.locator('.panel-drag-overlay')).toBeVisible();
}

async function moveToCenter(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 8 });
}

test.describe('explicit panel drag and dock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?ide_perf=1');
    await page.waitForFunction(() => Boolean(window.__M68K_IDE_PERF__?.reset));
    await page.evaluate(() => window.__M68K_IDE_PERF__?.reset());
  });

  test('uses the safe header, inert overlay, and only explicit insertion zones', async ({ page }) => {
    const screenPanel = page.getByTestId('panel-instance-panel-terminal-1');
    const screenHeader = screenPanel.locator('.panel-frame-header');
    const screenTitle = screenHeader.getByRole('heading', { name: 'Screen' });
    const screenBody = screenPanel.locator('.panel-body');

    await expect(screenHeader).toHaveCSS('cursor', 'grab');
    await page.getByRole('button', { name: 'Minimize Screen' }).click();
    expect(await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot().panelWorkspace.dragStarts)).toBe(0);
    await page.getByRole('button', { name: 'Restore Screen' }).click();
    const layoutCommitsBeforeDrag = await page.evaluate(
      () => window.__M68K_IDE_PERF__!.snapshot().panelWorkspace.layoutCommits,
    );

    await beginPointerDrag(page, screenTitle);
    await expect(page.getByTestId('panel-workspace')).toHaveAttribute('data-panel-drag-active', 'true');
    await expect(page.getByTestId('panel-workspace')).toHaveCSS('cursor', 'grabbing');
    await expect(screenPanel).toHaveAttribute('data-panel-dragging', 'true');
    await expect(page.locator('.panel-drag-overlay .panel-body')).toHaveCount(0);

    await moveToCenter(page, screenBody);
    await expect(page.locator('[data-panel-dock-active="true"]')).toHaveCount(0);

    const columnTwoEnd = page.locator(
      '[data-panel-dock-target][data-panel-column-index="1"][data-panel-dock-relation="after"]',
    );
    await expect(columnTwoEnd).toHaveCount(1);
    await moveToCenter(page, columnTwoEnd);
    await expect(columnTwoEnd).toHaveAttribute('data-panel-dock-active', 'true');
    await page.mouse.up();

    await expect(page.locator('[data-panel-column-id="column-2"] [data-panel-instance-id="panel-terminal-1"]')).toBeVisible();
    await expect(page.locator('.panel-drag-overlay')).toHaveCount(0);
    const telemetry = await page.evaluate(() => window.__M68K_IDE_PERF__!.snapshot());
    expect(telemetry.panelWorkspace.dragStarts).toBe(1);
    expect(telemetry.panelWorkspace.validDockDrops).toBe(1);
    expect(telemetry.panelWorkspace.layoutCommits - layoutCommitsBeforeDrag).toBe(1);
    expect(telemetry.workerTransport.commandsSent).toBe(0);
  });

  test('floats outside targets, moves freely, deliberately re-docks, and persists', async ({ page }) => {
    const screenPanel = page.getByTestId('panel-instance-panel-terminal-1');
    await beginPointerDrag(page, screenPanel.getByRole('heading', { name: 'Screen' }));
    const navbar = page.locator('.navbar');
    await moveToCenter(page, navbar);
    await expect(page.locator('[data-panel-dock-active="true"]')).toHaveCount(0);
    await page.mouse.up();

    const floatingWindow = page.locator('.floating-panel-window', { has: page.getByTestId('panel-instance-panel-terminal-1') });
    await expect(floatingWindow).toBeVisible();
    const beforeMove = await floatingWindow.boundingBox();
    await beginPointerDrag(page, floatingWindow.getByRole('heading', { name: 'Screen' }));
    const navbarBox = await navbar.boundingBox();
    expect(navbarBox).not.toBeNull();
    await page.mouse.move(navbarBox!.x + 80, navbarBox!.y + navbarBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    const afterMove = await floatingWindow.boundingBox();
    expect(afterMove?.x).not.toBe(beforeMove?.x);

    await beginPointerDrag(page, floatingWindow.getByRole('heading', { name: 'Screen' }));
    const columnOneEmpty = page.locator(
      '[data-panel-dock-target][data-panel-column-index="0"][data-panel-dock-relation="empty"]',
    );
    await expect(columnOneEmpty).toHaveCount(1);
    await moveToCenter(page, columnOneEmpty);
    await expect(columnOneEmpty).toHaveAttribute('data-panel-dock-active', 'true');
    await page.mouse.up();

    await expect(floatingWindow).toHaveCount(0);
    await expect(page.locator('[data-panel-column-id="column-1"] [data-panel-instance-id="panel-terminal-1"]')).toBeVisible();
    await page.waitForFunction(() =>
      window.localStorage.getItem('m68k.ide.preferences.v2')?.includes('"panel-terminal-1"'),
    );
    await page.reload();
    await expect(page.locator('[data-panel-column-id="column-1"] [data-panel-instance-id="panel-terminal-1"]')).toBeVisible();
    await expect(page.locator('.floating-panel-window')).toHaveCount(0);
  });

  test('supports semantic keyboard docking, cancellation, and focus restoration', async ({ page }) => {
    const handle = page.getByRole('button', { name: 'Drag Screen panel' });
    await handle.focus();
    await handle.press('Space');
    await expect(page.locator('.panel-drag-overlay')).toBeVisible();
    await handle.press('ArrowRight');
    await handle.press('ArrowRight');
    await handle.press('Enter');

    await expect(page.locator('[data-panel-column-id="column-2"] [data-panel-instance-id="panel-terminal-1"]')).toBeVisible();
    await expect(handle).toBeFocused();

    await handle.press('Space');
    await expect(page.locator('.panel-drag-overlay')).toBeVisible();
    await handle.press('Escape');
    await expect(page.locator('.panel-drag-overlay')).toHaveCount(0);
    await expect(page.locator('[data-panel-column-id="column-2"] [data-panel-instance-id="panel-terminal-1"]')).toBeVisible();
    expect(await page.evaluate(() => window.__M68K_IDE_PERF__!.snapshot().panelWorkspace.dragCancels)).toBe(1);
  });

  test('removes drag motion and preserves a forced-colors target outline', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active', reducedMotion: 'reduce' });
    await page.reload();
    const handle = page.getByRole('button', { name: 'Drag Screen panel' });
    await handle.press('Space');
    const activeTarget = page.locator('[data-panel-dock-active="true"]');
    await expect(activeTarget).toBeVisible();
    await expect(activeTarget).toHaveCSS('transition-duration', '0s');
    await expect(activeTarget).toHaveCSS('outline-style', 'solid');
    await expect(page.locator('.panel-drag-overlay')).toHaveCSS('transform', 'none');
    await handle.press('Escape');
  });
});
