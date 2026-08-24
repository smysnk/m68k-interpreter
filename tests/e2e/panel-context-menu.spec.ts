import { expect, test, type Locator, type Page } from '@playwright/test';
import { ignoreBootSourceConfiguration, openBaselineIde } from './sourceIdeE2eHelpers';

const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v3';

const PANEL_CATALOGUE = [
  { kind: 'terminal', title: 'Screen' },
  { kind: 'code', title: 'Code' },
  { kind: 'registers', title: 'Registers' },
  { kind: 'memory', title: 'Memory' },
  { kind: 'hardware-display', title: 'Seven-segment display' },
  { kind: 'hardware-digital-io', title: 'LEDs / Switches / Buttons' },
  { kind: 'hardware-interrupts', title: 'CPU Interrupt Lines' },
  { kind: 'help', title: 'Help' },
] as const;

async function openViewMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open app menu/i }).click();
  await page.getByRole('menuitem', { name: /^view$/i }).click();
}

async function setColumnCount(page: Page, count: number): Promise<void> {
  await openViewMenu(page);
  await page.getByRole('menuitem', { name: 'Columns' }).click();
  await page
    .getByRole('menuitemradio', { name: `${count} column${count === 1 ? '' : 's'}` })
    .click();
}

async function openPanelCatalogue(
  page: Page,
  target: Locator,
  position?: { x: number; y: number }
): Promise<Locator> {
  await target.click({ button: 'right', position });
  const rootMenu = page.getByRole('menu', { name: 'Panel workspace actions' });
  await expect(rootMenu).toBeVisible();
  await rootMenu.getByRole('menuitem', { name: 'Add a panel' }).click();
  const catalogue = page.getByRole('menu', { name: 'Add a panel' });
  await expect(catalogue).toBeVisible();
  return catalogue;
}

async function addPanelAt(
  page: Page,
  target: Locator,
  panelTitle: string,
  position?: { x: number; y: number }
): Promise<void> {
  const catalogue = await openPanelCatalogue(page, target, position);
  await catalogue.getByRole('menuitem', { name: `Add ${panelTitle} panel` }).click();
  await expect(page.getByRole('menu', { name: 'Panel workspace actions' })).toHaveCount(0);
}

async function dockedKinds(column: Locator): Promise<string[]> {
  return column.evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>('[data-panel-instance-id][data-panel-kind]'))
      .map((child) => child.dataset.panelKind)
      .filter((kind): kind is string => Boolean(kind))
  );
}

async function beginPointerDrag(page: Page, activator: Locator): Promise<void> {
  const box = await activator.boundingBox();
  expect(box).not.toBeNull();
  const start = {
    x: box!.x + Math.min(box!.width / 2, 120),
    y: box!.y + box!.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 6);
  await expect(page.locator('.panel-drag-overlay')).toBeVisible();
}

test.describe('panel workspace context menu', () => {
  test('inserts at the clicked panel location and preserves the exact order after reload', async ({
    page,
  }) => {
    await openBaselineIde(page);
    const screenColumn = page.getByTestId('panel-column-2');
    const screenPanel = page.getByTestId('panel-instance-panel-terminal-1');
    const screenBox = await screenPanel.boundingBox();
    expect(screenBox).not.toBeNull();

    await addPanelAt(page, screenPanel, 'Memory', {
      x: Math.min(80, screenBox!.width / 2),
      y: Math.min(30, screenBox!.height / 4),
    });

    await expect.poll(() => dockedKinds(screenColumn)).toEqual(['memory', 'terminal', 'registers']);
    await page.waitForFunction(
      (storageKey) => window.localStorage.getItem(storageKey)?.includes('"kind":"memory"'),
      IDE_PERSISTENCE_KEY
    );
    await page.reload();
    await ignoreBootSourceConfiguration(page);
    await expect.poll(() => dockedKinds(screenColumn)).toEqual(['memory', 'terminal', 'registers']);
  });

  test('keeps root and nested menus inside every viewport edge across one to four columns', async ({
    page,
  }) => {
    await openBaselineIde(page);
    for (const count of [1, 2, 3, 4]) {
      await setColumnCount(page, count);
      const column = page.getByTestId(`panel-column-${count}`);
      const box = await column.boundingBox();
      expect(box).not.toBeNull();
      const catalogue = await openPanelCatalogue(page, column, {
        x: Math.max(1, box!.width - 2),
        y: Math.max(1, box!.height - 2),
      });
      const viewport = page.viewportSize()!;
      for (const menu of [page.getByRole('menu', { name: 'Panel workspace actions' }), catalogue]) {
        const menuBox = await menu.boundingBox();
        expect(menuBox).not.toBeNull();
        expect(menuBox!.x).toBeGreaterThanOrEqual(0);
        expect(menuBox!.y).toBeGreaterThanOrEqual(0);
        expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width);
        expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);
      }
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: 'Panel workspace actions' })).toHaveCount(0);
    }

    const themeToggle = page.getByTestId('navbar-theme-toggle');
    await themeToggle.click();
    const workspace = page.getByTestId('panel-workspace');
    await workspace.click({ button: 'right', position: { x: 16, y: 16 } });
    await expect(page.getByRole('menu', { name: 'Panel workspace actions' })).toBeVisible();
  });

  test('creates every registered panel type from the shared catalogue and every surface reopens it', async ({
    page,
  }) => {
    await openBaselineIde(page);
    const column = page.getByTestId('panel-column-1');
    for (const entry of PANEL_CATALOGUE) {
      const existing = page.locator(`[data-panel-kind="${entry.kind}"]`);
      const countBefore = await existing.count();
      await column.scrollIntoViewIfNeeded();
      await addPanelAt(page, column, entry.title, { x: 24, y: 24 });
      await expect(existing).toHaveCount(countBefore + 1);
      const newest = existing.last();
      await newest.scrollIntoViewIfNeeded();
      await newest.dispatchEvent('contextmenu', {
        bubbles: true,
        button: 2,
        clientX: 12,
        clientY: 12,
      });
      await expect(page.getByRole('menu', { name: 'Panel workspace actions' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('uses the focused panel location in compact mode', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBaselineIde(page, '/?ide_perf=1');
    await page.getByRole('tab', { name: /registers/i }).click();
    const registers = page.locator('[data-panel-kind="registers"]');
    await addPanelAt(page, registers, 'Help', { x: 20, y: 20 });
    await expect(page.locator('[data-panel-kind="help"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
  });

  test('creates and resizes a floating panel near a floating invocation point', async ({
    page,
  }) => {
    await openBaselineIde(page, '/?ide_perf=1');
    const screenPanel = page.getByTestId('panel-instance-panel-terminal-1');
    await beginPointerDrag(page, screenPanel.getByRole('heading', { name: 'Screen' }));
    const navbarBox = await page.locator('.navbar').boundingBox();
    expect(navbarBox).not.toBeNull();
    await page.mouse.move(navbarBox!.x + 80, navbarBox!.y + navbarBox!.height / 2, { steps: 8 });
    await page.mouse.up();

    const floatingScreen = page.locator('.floating-panel-window', { has: screenPanel });
    await expect(floatingScreen).toBeVisible();
    await addPanelAt(page, floatingScreen, 'Memory', { x: 30, y: 30 });
    const floatingMemory = page.locator('.floating-panel-window', {
      has: page.locator('[data-panel-kind="memory"]'),
    });
    await expect(floatingMemory).toBeVisible();

    const workspaceBox = await page.getByTestId('panel-workspace').boundingBox();
    const memoryBox = await floatingMemory.boundingBox();
    expect(workspaceBox).not.toBeNull();
    expect(memoryBox).not.toBeNull();
    expect(memoryBox!.x).toBeGreaterThanOrEqual(workspaceBox!.x);
    expect(memoryBox!.y).toBeGreaterThanOrEqual(workspaceBox!.y);
    expect(memoryBox!.x + memoryBox!.width).toBeLessThanOrEqual(
      workspaceBox!.x + workspaceBox!.width + 1
    );
    expect(memoryBox!.y + memoryBox!.height).toBeLessThanOrEqual(
      workspaceBox!.y + workspaceBox!.height + 1
    );

    const resizeHandle = floatingMemory.getByRole('button', { name: 'Resize Memory' });
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + 42, handleBox!.y + 32, { steps: 5 });
    await page.mouse.up();
    const resizedBox = await floatingMemory.boundingBox();
    expect(resizedBox!.width).toBeGreaterThan(memoryBox!.width);
    expect(resizedBox!.height).toBeGreaterThan(memoryBox!.height);
  });
});
