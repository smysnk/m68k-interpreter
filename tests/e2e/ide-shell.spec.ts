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

    await codeTab.click();
    await expect(codeTab).toHaveAttribute('aria-selected', 'true');

    const persistedBeforeReload = await page.evaluate((storageKey) => {
      return window.localStorage.getItem(storageKey);
    }, IDE_PERSISTENCE_KEY);

    expect(persistedBeforeReload).toContain('"workspaceTab":"code"');
    expect(persistedBeforeReload).toContain(
      expectedTheme === 'dark' ? '"editorTheme":"M68K_DARK"' : '"editorTheme":"M68K_LIGHT"'
    );

    await page.reload();

    await expect(appContainer).toHaveAttribute('data-theme', expectedTheme);
    await expect(page.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows terminal focus glow state and keeps the register identity column separate from controls', async ({
    page,
  }) => {
    await page.goto('/');

    const terminalScreen = page.getByTestId('terminal-screen');
    await terminalScreen.click();
    await expect(terminalScreen).toHaveAttribute('data-terminal-focused', 'true');

    const registerCard = page.locator('.register-card', {
      has: page.getByText('D0', { exact: true }),
    }).first();
    const registerLabel = registerCard.locator('.register-card-label');
    const registerBadge = registerCard.locator('.register-card-meta-badge');
    const fullHex = page.getByLabel('D0 full hex value');
    const lowerHex = page.getByLabel('D0 row 2 hex input');
    const decimalInput = page.getByLabel('D0 dec input');

    await expect(fullHex).toHaveValue('0x00000000');
    await expect(lowerHex).toHaveValue('0x0000');

    const [labelBox, badgeBox, fullHexBox, lowerHexBox] = await Promise.all([
      registerLabel.boundingBox(),
      registerBadge.boundingBox(),
      fullHex.boundingBox(),
      lowerHex.boundingBox(),
    ]);

    expect(labelBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(fullHexBox).not.toBeNull();
    expect(lowerHexBox).not.toBeNull();

    expect((labelBox?.x ?? 0) + (labelBox?.width ?? 0)).toBeLessThan(fullHexBox?.x ?? 0);
    expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThan(fullHexBox?.x ?? 0);
    expect((badgeBox?.y ?? 0)).toBeGreaterThan((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - 2);
    expect(Math.abs((fullHexBox?.x ?? 0) - (lowerHexBox?.x ?? 0))).toBeLessThan(4);

    const [fullHexFont, lowerHexFont, decimalFont] = await Promise.all([
      fullHex.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
        };
      }),
      lowerHex.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
        };
      }),
      decimalInput.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
        };
      }),
    ]);

    expect(fullHexFont.fontSize).toBe(lowerHexFont.fontSize);
    expect(fullHexFont.fontSize).toBe(decimalFont.fontSize);
    expect(fullHexFont.fontFamily).toBe(lowerHexFont.fontFamily);
    expect(fullHexFont.fontFamily).toBe(decimalFont.fontFamily);
    expect(fullHexFont.fontFamily.toLowerCase()).toContain('courier new');

    const [fullHexHeight, lowerHexHeight, decimalHeight] = await Promise.all([
      fullHex.evaluate((element) => window.getComputedStyle(element).height),
      lowerHex.evaluate((element) => window.getComputedStyle(element).height),
      decimalInput.evaluate((element) => window.getComputedStyle(element).height),
    ]);

    expect(decimalHeight).toBe(fullHexHeight);
    expect(decimalHeight).toBe(lowerHexHeight);

    await lowerHex.focus();
    await lowerHex.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.setSelectionRange(4, 5);
      input.dispatchEvent(new Event('select', { bubbles: true }));
    });
    await page.keyboard.press('A');

    await expect(lowerHex).toHaveValue('0x00A0');
    await expect(fullHex).toHaveValue('0x000000A0');
  });
});
