import { expect, test } from '@playwright/test';

const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v1';

test.describe('browser e2e ide shell', () => {
  test('persists theme and shell layout state across reload', async ({ page }) => {
    await page.goto('/');

    const appContainer = page.getByTestId('app-container');
    const appMenuButton = page.getByRole('button', { name: /open app menu/i });
    const terminalTab = page.getByRole('tab', { name: /terminal/i });
    const codeTab = page.getByRole('tab', { name: /code/i });
    const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
    const initialTheme = await appContainer.getAttribute('data-theme');
    const themeMenuLabel = initialTheme === 'dark' ? /m68k light/i : /m68k dark/i;
    const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';

    const menuButtonBox = await appMenuButton.boundingBox();
    const terminalTabBox = await terminalTab.boundingBox();
    expect(menuButtonBox).not.toBeNull();
    expect(terminalTabBox).not.toBeNull();
    expect((menuButtonBox?.x ?? 0) + (menuButtonBox?.width ?? 0)).toBeLessThan(
      terminalTabBox?.x ?? 0
    );
    const explorerTabBox = await fileExplorerTab.boundingBox();
    expect(explorerTabBox).not.toBeNull();
    expect(explorerTabBox?.x ?? 999).toBeLessThan(4);

    await appMenuButton.click();
    const appMenu = page.getByTestId('navbar-app-menu');
    const styleMenuItem = page.getByRole('menuitem', { name: /style/i });
    await expect(appMenu).toBeVisible();
    await styleMenuItem.click({ trial: true });

    const menuBox = await appMenu.boundingBox();
    const buttonBox = await appMenuButton.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(Math.abs((menuBox?.x ?? 0) - (buttonBox?.x ?? 0))).toBeLessThan(16);

    await styleMenuItem.click();

    const styleSubmenu = page.getByTestId('navbar-style-submenu');
    const themeMenuItem = page.getByRole('menuitem', { name: themeMenuLabel });
    await expect(styleSubmenu).toBeVisible();
    await themeMenuItem.click({ trial: true });

    await themeMenuItem.click();
    await expect(appContainer).toHaveAttribute('data-theme', expectedTheme);

    await appMenuButton.click();
    await page.getByRole('menuitem', { name: /compatibility notes/i }).click();
    await expect(page.getByLabel('Compatibility notes')).toBeVisible();

    await codeTab.click();
    await expect(codeTab).toHaveAttribute('aria-selected', 'true');

    const contextPanel = page.getByTestId('context-panel');
    const contextHandle = page.getByTestId('resize-handle-context');
    const beforeBox = await contextPanel.boundingBox();
    const handleBox = await contextHandle.boundingBox();

    expect(beforeBox?.width ?? 0).toBeGreaterThan(100);
    expect(handleBox).not.toBeNull();

    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 80, handleBox.y + handleBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    const resizedBox = await contextPanel.boundingBox();
    expect(resizedBox?.width ?? 0).toBeGreaterThan((beforeBox?.width ?? 0) + 20);

    const persistedBeforeReload = await page.evaluate((storageKey) => {
      return window.localStorage.getItem(storageKey);
    }, IDE_PERSISTENCE_KEY);

    expect(persistedBeforeReload).toContain('"workspaceTab":"code"');
    expect(persistedBeforeReload).toContain('"contextOpen":true');
    expect(persistedBeforeReload).toContain(
      expectedTheme === 'dark' ? '"editorTheme":"M68K_DARK"' : '"editorTheme":"M68K_LIGHT"'
    );

    await page.reload();

    await expect(appContainer).toHaveAttribute('data-theme', expectedTheme);
    await expect(page.getByLabel('Compatibility notes')).toBeVisible();
    await expect(page.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');

    const reloadedBox = await page.getByTestId('context-panel').boundingBox();
    expect(Math.abs((reloadedBox?.width ?? 0) - (resizedBox?.width ?? 0))).toBeLessThan(40);
  });
});
