import { expect, test } from '@playwright/test';
import { openBaselineIde } from './sourceIdeE2eHelpers';

const SOURCE = `START
  MOVEQ #0,D0
LOOP
  ADDQ.L #1,D0
  BRA LOOP
  END START`;

const REASSEMBLED_SOURCE = `START
  MOVEQ #0,D0
  ; changed source moves the target beyond the prior program's source map
  NOP
  ; padding
  NOP
  ; padding
TARGET
  ADDQ.L #1,D0
  BRA TARGET
  END START`;

test.describe('source debugger vertical slice', () => {
  test('stops before a gutter breakpoint and never opens debugging panels automatically', async ({
    page,
  }) => {
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(SOURCE);
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);

    const breakpointMarkers = page.locator('.debug-breakpoint-marker');
    await expect(breakpointMarkers).toHaveCount(1); // CodeMirror's sizing spacer.
    const addInstructionLineNumber = page
      .locator('.cm-lineNumbers .cm-gutterElement')
      .filter({ hasText: /^4$/ });
    await addInstructionLineNumber.click();
    await expect(breakpointMarkers).toHaveCount(2);
    await addInstructionLineNumber.click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Breakpoint actions' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Disable breakpoint' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('button[aria-label="Start program"]').click();
    await expect(page.locator('.status-pill')).toContainText('Breakpoint');
    await expect(page.locator('.cm-debug-current-line')).toContainText('ADDQ.L #1,D0');
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);

    await page.locator('button[aria-label="Continue program"]').click();
    await expect(page.locator('.status-pill')).toContainText('Breakpoint');
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);
  });

  test('reassembles changed source and applies its breakpoint when Play is pressed', async ({
    page,
  }) => {
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(SOURCE);

    const codePanel = page.locator('[data-panel-kind="code"]');
    await codePanel.getByRole('button', { name: /step into/i }).click();
    await expect(page.locator('.status-pill')).toContainText('Paused');

    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(REASSEMBLED_SOURCE);
    const targetLineNumber = page
      .locator('.cm-lineNumbers .cm-gutterElement')
      .filter({ hasText: /^9$/ });
    await targetLineNumber.click();

    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('Breakpoint');
    await expect(page.locator('.cm-debug-current-line')).toContainText('ADDQ.L #1,D0');
  });

  test('keeps stepping in the Code header and supports the explicit Debug workspace', async ({
    page,
  }) => {
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Debug layout' }).click();
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(1);
    await expect(page.getByTestId('debugger-panel')).toBeVisible();
    const codePanel = page.locator('[data-panel-kind="code"]');
    await expect(codePanel.getByRole('button', { name: /step over/i })).toBeVisible();
    await expect(codePanel.getByRole('button', { name: /step into/i })).toBeVisible();
    await codePanel.getByRole('button', { name: /more debugging controls/i }).click();
    await expect(page.getByRole('menuitem', { name: /step out/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /run to cursor/i })).toBeVisible();
    await expect(page.locator('.navbar').getByRole('button', { name: /step over/i })).toHaveCount(
      0
    );
    const codeTitle = codePanel.getByRole('heading', { name: 'Code', exact: true });
    const debugControls = codePanel.getByRole('toolbar', { name: 'Code debugging controls' });
    const panelControls = codePanel.getByRole('toolbar', { name: 'Code panel controls' });
    const [titleBox, debugBox, panelControlsBox] = await Promise.all([
      codeTitle.boundingBox(),
      debugControls.boundingBox(),
      panelControls.boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(debugBox).not.toBeNull();
    expect(panelControlsBox).not.toBeNull();
    expect(debugBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
    expect(debugBox!.x - (titleBox!.x + titleBox!.width)).toBeLessThanOrEqual(12);
    expect(panelControlsBox!.x).toBeGreaterThan(debugBox!.x + debugBox!.width);
  });

  test('keeps the dedicated breakpoint gutter interactive when line numbers are hidden', async ({
    page,
  }) => {
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(SOURCE);

    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /line numbers/i }).click();
    await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);

    const debuggerGutter = page.locator('.cm-debugger-gutter');
    const targetLine = page.locator('.cm-line').filter({ hasText: 'ADDQ.L #1,D0' });
    const [gutterBox, lineBox] = await Promise.all([
      debuggerGutter.boundingBox(),
      targetLine.boundingBox(),
    ]);
    expect(gutterBox).not.toBeNull();
    expect(lineBox).not.toBeNull();
    const x = gutterBox!.x + gutterBox!.width / 2;
    const y = lineBox!.y + lineBox!.height / 2;

    await page.mouse.click(x, y);
    await expect(page.locator('.debug-breakpoint-marker')).toHaveCount(2);
    await page.mouse.click(x, y, { button: 'right' });
    await expect(page.getByRole('menu', { name: 'Breakpoint actions' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Disable breakpoint' })).toBeVisible();
  });
});
