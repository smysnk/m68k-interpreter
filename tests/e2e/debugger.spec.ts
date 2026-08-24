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

const WAIT_FOR_INPUT_SOURCE = `START
  MOVEQ #5,D0
  TRAP #15
AFTER_INPUT
  MOVE.B D1,D2
LOOP
  BRA LOOP
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
    const codePanel = page.locator('[data-panel-kind="code"]');
    await expect(codePanel.getByRole('button', { name: /step into/i })).toBeVisible();
    await expect(
      codePanel.getByRole('toolbar', { name: 'Code debugging controls' })
    ).toHaveAttribute('data-expanded', 'true');

    await page.locator('button[aria-label="Continue program"]').click();
    await expect(page.locator('.status-pill')).toContainText('Breakpoint');
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);
  });

  test('pauses from the collapsed Debug button and highlights the current instruction', async ({
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
    const debugToolbar = codePanel.getByRole('toolbar', { name: 'Code debugging controls' });
    await expect(debugToolbar).toHaveAttribute('data-expanded', 'false');
    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    const debugButton = codePanel.getByRole('button', { name: 'Pause for debugging' });
    await expect(debugButton).toBeEnabled();
    await page.evaluate(() => window.__M68K_IDE_PERF__?.reset());
    await page.waitForTimeout(300);
    const steadyStateSnapshot = await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot());
    await page.waitForTimeout(300);
    const unchangedSnapshot = await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot());
    expect(unchangedSnapshot?.debuggerSurface.snapshotDispatchCount).toBe(
      steadyStateSnapshot?.debuggerSurface.snapshotDispatchCount
    );
    expect(
      unchangedSnapshot?.renderStats.find((stat) => stat.id === 'CodeDebuggerHeaderAccessory')
        ?.renderCount ?? 0
    ).toBe(
      steadyStateSnapshot?.renderStats.find((stat) => stat.id === 'CodeDebuggerHeaderAccessory')
        ?.renderCount ?? 0
    );

    const pauseStartedAt = await page.evaluate(() => performance.now());
    await debugButton.click();

    await expect(page.locator('.status-pill')).toContainText('Paused');
    await expect(page.locator('.cm-debug-current-line')).toHaveCount(1);
    const pauseToHighlightMs = (await page.evaluate(() => performance.now())) - pauseStartedAt;
    expect(pauseToHighlightMs).toBeLessThan(1_000);
    await expect(debugToolbar).toHaveAttribute('data-expanded', 'true');
    await expect(codePanel.getByRole('button', { name: /step into/i })).toBeVisible();
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);

    const stoppedLine = await page.locator('.cm-debug-current-line').textContent();
    await codePanel.getByRole('button', { name: /step into/i }).click();
    await expect
      .poll(() => page.locator('.cm-debug-current-line').textContent())
      .not.toBe(stoppedLine);

    const pauseTelemetry = await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot());
    expect(pauseTelemetry?.debuggerSurface).toMatchObject({
      pauseRequestCount: 1,
      pauseSnapshotCount: 1,
    });
    expect(pauseTelemetry!.debuggerSurface.snapshotDispatchCount).toBe(
      (steadyStateSnapshot?.debuggerSurface.snapshotDispatchCount ?? 0) + 2
    );
    expect(pauseTelemetry!.debuggerSurface.lastPauseToSnapshotLatencyMs).toBeLessThan(1_000);
    expect(pauseTelemetry!.debuggerSurface.maxSnapshotPayloadBytes).toBeGreaterThan(0);

    await page.locator('button[aria-label="Continue program"]').click();
    await expect(debugToolbar).toHaveAttribute('data-expanded', 'false');
    await expect(codePanel.getByRole('button', { name: 'Pause for debugging' })).toBeVisible();
  });

  test('keeps duplicate Code-panel controls synchronized around one pause command', async ({
    page,
  }) => {
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();

    const firstCodePanel = page.locator('[data-panel-kind="code"]').first();
    await firstCodePanel.click({ button: 'right', position: { x: 40, y: 100 } });
    const workspaceMenu = page.getByRole('menu', { name: 'Panel workspace actions' });
    await workspaceMenu.getByRole('menuitem', { name: 'Add a panel' }).click();
    await page
      .getByRole('menu', { name: 'Add a panel' })
      .getByRole('menuitem', { name: 'Add Code panel' })
      .click();
    await expect(page.locator('[data-panel-kind="code"]')).toHaveCount(2);

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(SOURCE);
    await page.getByRole('button', { name: 'Start program', exact: true }).click();

    const toolbars = page.getByRole('toolbar', { name: 'Code debugging controls' });
    await expect(toolbars).toHaveCount(2);
    await expect(toolbars.nth(0)).toHaveAttribute('data-expanded', 'false');
    await expect(toolbars.nth(1)).toHaveAttribute('data-expanded', 'false');
    await page
      .locator('[data-panel-kind="code"]')
      .first()
      .getByRole('button', { name: 'Pause for debugging' })
      .click();

    await expect(page.locator('.status-pill')).toContainText('Paused');
    await expect(toolbars.nth(0)).toHaveAttribute('data-expanded', 'true');
    await expect(toolbars.nth(1)).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('.cm-debug-current-line')).toHaveCount(2);
  });

  test('starts one shared inspection session from a waiting input instruction', async ({
    page,
  }) => {
    test.fail(true, 'Waiting-input debugger attachment is the next implementation phase.');
    test.setTimeout(30_000);
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();

    const firstCodePanel = page.locator('[data-panel-kind="code"]').first();
    await firstCodePanel.click({ button: 'right', position: { x: 40, y: 100 } });
    await page
      .getByRole('menu', { name: 'Panel workspace actions' })
      .getByRole('menuitem', { name: 'Add a panel' })
      .click();
    await page
      .getByRole('menu', { name: 'Add a panel' })
      .getByRole('menuitem', { name: 'Add Code panel' })
      .click();

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(WAIT_FOR_INPUT_SOURCE);
    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('Waiting');

    const inspectButtons = page.getByRole('button', {
      name: /Inspect waiting instruction|Pause for debugging/,
    });
    await expect(inspectButtons).toHaveCount(2, { timeout: 5_000 });
    await expect(inspectButtons.first()).toBeEnabled({ timeout: 1_000 });
    await expect(inspectButtons.first()).toHaveAttribute(
      'title',
      'Inspect the instruction waiting for input'
    );
    await inspectButtons.first().click();

    const toolbars = page.getByRole('toolbar', { name: 'Code debugging controls' });
    await expect(toolbars.nth(0)).toHaveAttribute('data-expanded', 'true');
    await expect(toolbars.nth(1)).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('.cm-debug-current-line')).toHaveCount(2);
    await expect(page.locator('.cm-debug-current-line').first()).toContainText('MOVE.B D1,D2');
    await expect(page.locator('[data-panel-kind="debugger"]')).toHaveCount(0);
    await expect(firstCodePanel.getByRole('button', { name: 'Step backward' })).toBeEnabled();
    await expect(firstCodePanel.getByRole('button', { name: 'Step into' })).toBeDisabled();
  });

  test('stops after inspected input resolves and clears inspection on continue', async ({
    page,
  }) => {
    test.fail(true, 'Pause-after-input and waiting-inspection lifecycle are not implemented yet.');
    test.setTimeout(30_000);
    await openBaselineIde(page);
    await page.getByRole('button', { name: /open app menu/i }).click();
    await page.getByRole('menuitem', { name: /^view$/i }).click();
    await page.getByRole('menuitem', { name: /layouts/i }).click();
    await page.getByRole('menuitem', { name: 'Apply Code and Run layout' }).click();

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(WAIT_FOR_INPUT_SOURCE);
    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('Waiting');

    const codePanel = page.locator('[data-panel-kind="code"]');
    const debugToolbar = codePanel.getByRole('toolbar', { name: 'Code debugging controls' });
    const inspectButton = codePanel.getByRole('button', {
      name: /Inspect waiting instruction|Pause for debugging/,
    });
    await expect(inspectButton).toBeEnabled({ timeout: 1_000 });
    await inspectButton.click();
    await page.evaluate(() => window.__M68K_IDE_PERF__?.reset());

    const terminal = page.getByRole('application', { name: 'M68K interactive terminal' });
    await terminal.focus();
    await page.keyboard.type('w');
    await expect(page.locator('.status-pill')).toContainText('Paused');
    await expect(page.locator('.cm-debug-current-line')).toContainText('MOVE.B D1,D2');
    await expect(codePanel.getByRole('button', { name: 'Step into' })).toBeEnabled();

    const beforeIdleWindow = await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot());
    await page.waitForTimeout(300);
    const afterIdleWindow = await page.evaluate(() => window.__M68K_IDE_PERF__?.snapshot());
    expect(afterIdleWindow?.debuggerSurface.snapshotDispatchCount).toBe(
      beforeIdleWindow?.debuggerSurface.snapshotDispatchCount
    );

    await page.getByRole('button', { name: 'Continue program' }).click();
    await expect(debugToolbar).toHaveAttribute('data-expanded', 'false');
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
    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    const debugButton = codePanel.getByRole('button', { name: 'Pause for debugging' });
    await expect(debugButton).toBeEnabled();
    await debugButton.click();
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
    await expect(codePanel.getByRole('button', { name: 'Pause for debugging' })).toBeDisabled();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(SOURCE);
    await page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^4$/ }).click();
    await page.getByRole('button', { name: 'Start program', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('Breakpoint');
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
