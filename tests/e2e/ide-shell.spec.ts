import { expect, test } from '@playwright/test';

const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v1';

test.describe('browser e2e ide shell', () => {
  test('persists theme and shell layout state across reload', async ({ page }) => {
    await page.goto('/');

    const appContainer = page.getByTestId('app-container');
    const contextToggle = page.getByTitle(/compatibility notes/i);
    const codeTab = page.getByRole('tab', { name: /code/i });
    const initialTheme = await appContainer.getAttribute('data-theme');
    const toggleLabel =
      initialTheme === 'dark' ? /switch to light mode/i : /switch to dark mode/i;
    const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';

    await page.getByRole('button', { name: toggleLabel }).click();
    await expect(appContainer).toHaveAttribute('data-theme', expectedTheme);

    await contextToggle.click();
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
