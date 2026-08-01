import { expect, test } from '@playwright/test';

const IDE_PERSISTENCE_KEY = 'm68k.ide.preferences.v2';

test.describe('browser e2e ide shell', () => {
  test('uses a minimal workspace gutter and keeps panel content flush with its frame', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('.panel-workspace-toolbar')).toHaveCount(0);
    const mainContent = page.locator('.main-content');
    const columnGroup = page.locator('.panel-column-group');
    const firstColumn = page.getByTestId('panel-column-1');
    const lastColumn = page.getByTestId('panel-column-2');
    const firstPanel = page.getByTestId('panel-instance-panel-terminal-1');
    const gutter = await columnGroup.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingLeft)
    );
    const [mainBox, firstColumnBox, lastColumnBox, firstPanelBox] = await Promise.all([
      mainContent.boundingBox(),
      firstColumn.boundingBox(),
      lastColumn.boundingBox(),
      firstPanel.boundingBox(),
    ]);

    expect(mainBox).not.toBeNull();
    expect(firstColumnBox).not.toBeNull();
    expect(lastColumnBox).not.toBeNull();
    expect(firstPanelBox).not.toBeNull();
    expect(gutter).toBeGreaterThan(0);
    expect(gutter).toBeLessThan(3);
    expect(Math.abs(firstColumnBox!.x - mainBox!.x - gutter)).toBeLessThanOrEqual(1);
    expect(Math.abs(firstColumnBox!.y - mainBox!.y - gutter)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(mainBox!.x + mainBox!.width - (lastColumnBox!.x + lastColumnBox!.width) - gutter)
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(firstPanelBox!.x - firstColumnBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(firstPanelBox!.y - firstColumnBox!.y)).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: /open view menu/i }).click();
    await page.getByRole('menuitem', { name: /^add panel/i }).click();
    await page.getByRole('menuitem', { name: /add code panel/i }).click();

    const surfaceStyle = async (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            backdropFilter: styles.backdropFilter,
            borderRadius: styles.borderRadius,
            borderTopWidth: styles.borderTopWidth,
            boxShadow: styles.boxShadow,
          };
        });
    const [terminalSurface, registerSurface, editorSurface, panelFrameRadius, controlRadius] =
      await Promise.all([
        surfaceStyle('.panel-body > .terminal-container'),
        surfaceStyle('.panel-body > .registers-container'),
        surfaceStyle('.panel-body > .editor-container'),
        page
          .locator('.panel-frame')
          .first()
          .evaluate((element) => window.getComputedStyle(element).borderRadius),
        page
          .locator('.registers-group-toggle')
          .first()
          .evaluate((element) => window.getComputedStyle(element).borderRadius),
      ]);

    for (const surface of [terminalSurface, registerSurface, editorSurface]) {
      expect(surface).toEqual({
        backdropFilter: 'none',
        borderRadius: '0px',
        borderTopWidth: '0px',
        boxShadow: 'none',
      });
    }
    expect(panelFrameRadius).not.toBe('0px');
    expect(controlRadius).not.toBe('0px');
  });

  test('keeps View compact and reveals one contextual submenu at a time', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /open view menu/i }).click();
    const viewMenu = page.getByRole('menu', { name: 'View options' });
    await expect(viewMenu).toBeVisible();
    await expect(viewMenu.getByRole('menuitem')).toHaveCount(4);

    await viewMenu.getByRole('menuitem', { name: /columns/i }).click();
    const columnsSubmenu = page.getByTestId('navbar-view-columns-submenu');
    await expect(columnsSubmenu).toBeVisible();
    await expect(columnsSubmenu.getByRole('menuitemradio')).toHaveCount(4);

    await viewMenu.getByRole('menuitem', { name: /layouts/i }).click();
    await expect(columnsSubmenu).toHaveCount(0);
    await expect(page.getByTestId('navbar-view-layouts-submenu')).toBeVisible();
  });

  test('sizes docked hardware cards to their content instead of stretching them', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /open view menu/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Hardware Lab layout' }).click();

    const frames = page.locator(
      '.panel-column > .panel-frame[data-panel-kind^="hardware-"]'
    );
    await expect(frames).toHaveCount(2);
    const measurements = await frames.evaluateAll((elements) =>
      elements.map((frame) => {
        const header = frame.querySelector('.panel-frame-header');
        const body = frame.querySelector('.panel-body');
        const surface = body?.querySelector('.hardware-panel-surface');
        return {
          bodyClientHeight: body?.clientHeight ?? 0,
          bodyScrollHeight: body?.scrollHeight ?? 0,
          frameHeight: frame.getBoundingClientRect().height,
          headerHeight: header?.getBoundingClientRect().height ?? 0,
          surfaceHeight: surface?.getBoundingClientRect().height ?? 0,
        };
      })
    );

    for (const measurement of measurements) {
      expect(measurement.bodyClientHeight).toBeGreaterThanOrEqual(
        measurement.bodyScrollHeight - 1
      );
      expect(
        Math.abs(
          measurement.frameHeight -
            measurement.headerHeight -
            measurement.surfaceHeight -
            2
        )
      ).toBeLessThanOrEqual(2);
    }

    const matrixStyle = await page.getByTestId('hardware-io-matrix').evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        borderTopWidth: styles.borderTopWidth,
        overflow: styles.overflow,
      };
    });
    expect(matrixStyle).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderRadius: '0px',
      borderTopWidth: '0px',
      overflow: 'visible',
    });

    const displayLayout = await page
      .getByTestId(/hardware-display-device-/)
      .evaluate((surface) => {
        const bezel = surface.querySelector('[data-testid="hardware-seven-segment-bank"]');
        const surfaceRect = surface.getBoundingClientRect();
        const bezelRect = bezel?.getBoundingClientRect();
        const surfaceStyles = window.getComputedStyle(surface);
        const bezelStyles = bezel ? window.getComputedStyle(bezel) : null;
        return {
          bezelBorderRadius: bezelStyles?.borderRadius ?? '',
          bezelBorderTopWidth: bezelStyles?.borderTopWidth ?? '',
          bezelHeight: bezelRect?.height ?? 0,
          bezelWidth: bezelRect?.width ?? 0,
          bezelX: bezelRect?.x ?? 0,
          bezelY: bezelRect?.y ?? 0,
          surfaceHeight: surfaceRect.height,
          surfacePadding: surfaceStyles.padding,
          surfaceWidth: surfaceRect.width,
          surfaceX: surfaceRect.x,
          surfaceY: surfaceRect.y,
        };
      });
    expect(displayLayout.surfacePadding).toBe('0px');
    expect(displayLayout.bezelBorderRadius).toBe('0px');
    expect(displayLayout.bezelBorderTopWidth).toBe('0px');
    expect(displayLayout.bezelX).toBeCloseTo(displayLayout.surfaceX, 1);
    expect(displayLayout.bezelY).toBeCloseTo(displayLayout.surfaceY, 1);
    expect(displayLayout.bezelWidth).toBeCloseTo(displayLayout.surfaceWidth, 1);
    expect(displayLayout.bezelHeight).toBeCloseTo(displayLayout.surfaceHeight, 1);
  });

  test('persists theme and shell layout state across reload', async ({ page }) => {
    await page.goto('/');

    const appContainer = page.getByTestId('app-container');
    const appMenuButton = page.getByRole('button', { name: /open app menu/i });
    const viewMenuButton = page.getByRole('button', { name: /open view menu/i });
    const runButton = page.getByRole('button', { name: /run program/i });
    const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
    const initialTheme = await appContainer.getAttribute('data-theme');
    const themeMenuLabel = initialTheme === 'dark' ? /m68k light/i : /m68k dark/i;
    const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';

    const menuButtonBox = await appMenuButton.boundingBox();
    const viewMenuButtonBox = await viewMenuButton.boundingBox();
    const runButtonBox = await runButton.boundingBox();
    expect(menuButtonBox).not.toBeNull();
    expect(viewMenuButtonBox).not.toBeNull();
    expect(runButtonBox).not.toBeNull();
    await expect(page.getByRole('tablist', { name: 'Workspace views' })).toHaveCount(0);
    expect((menuButtonBox?.x ?? 0) + (menuButtonBox?.width ?? 0)).toBeLessThan(
      viewMenuButtonBox?.x ?? 0
    );
    expect((viewMenuButtonBox?.x ?? 0) + (viewMenuButtonBox?.width ?? 0)).toBeLessThan(
      runButtonBox?.x ?? 0
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

    await viewMenuButton.click();
    await page.getByRole('menuitem', { name: /^add panel/i }).click();
    await page.getByRole('menuitem', { name: /add code panel/i }).click();
    await expect(page.getByTestId('assembly-editor')).toBeVisible();
    await page.waitForFunction(
      (storageKey) => window.localStorage.getItem(storageKey)?.includes('"kind":"code"'),
      IDE_PERSISTENCE_KEY
    );

    const persistedBeforeReload = await page.evaluate((storageKey) => {
      return window.localStorage.getItem(storageKey);
    }, IDE_PERSISTENCE_KEY);

    expect(persistedBeforeReload).toContain('"kind":"code"');
    expect(persistedBeforeReload).toContain('"schemaVersion":2');
    expect(persistedBeforeReload).toContain(
      expectedTheme === 'dark' ? '"editorTheme":"M68K_DARK"' : '"editorTheme":"M68K_LIGHT"'
    );

    await page.reload();

    await expect(appContainer).toHaveAttribute('data-theme', expectedTheme);
    await expect(page.getByRole('tablist', { name: 'Workspace views' })).toHaveCount(0);
    await expect(page.getByTestId('assembly-editor')).toBeVisible();
  });

  test('shows terminal focus glow state and keeps the register identity column separate from controls', async ({
    page,
  }) => {
    await page.goto('/');

    const terminalScreen = page.getByTestId('terminal-screen');
    await terminalScreen.click();
    await expect(terminalScreen).toHaveAttribute('data-terminal-focused', 'true');

    const dataRegistersToggle = page.getByRole('button', { name: /data registers/i });
    await expect(dataRegistersToggle).toHaveAttribute('aria-expanded', 'false');
    await dataRegistersToggle.click();
    await expect(dataRegistersToggle).toHaveAttribute('aria-expanded', 'true');

    const registerCardToggle = page.getByRole('button', { name: /toggle d0 register view/i });
    await expect(registerCardToggle).toHaveAttribute('aria-expanded', 'false');
    await registerCardToggle.click();
    await expect(registerCardToggle).toHaveAttribute('aria-expanded', 'true');

    const registerCard = page
      .locator('.register-card', {
        has: registerCardToggle,
      })
      .first();
    const registerLabel = registerCard.locator('.register-card-toggle-label');
    const registerBadge = registerCard.locator('.register-card-meta-badge');
    const fullHex = registerCard.getByLabel('D0 full hex value');
    const lowerHex = registerCard.getByLabel('D0 row 2 hex input');
    const decimalInput = registerCard.getByLabel('D0 dec input');

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
    expect(badgeBox?.y ?? 0).toBeGreaterThan((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - 2);
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
