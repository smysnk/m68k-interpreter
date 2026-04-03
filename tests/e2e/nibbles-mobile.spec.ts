import { expect, test } from '@playwright/test';
import {
  captureTerminalTelemetryAfterInput,
  loadNibbles,
  startGameplayFromIntroTouch,
  touchTerminalCell,
  touchTerminalRelativeDirection,
  waitForGameplay,
  waitForIntro,
} from './nibblesE2eHelpers';

const viewportCases = [
  {
    name: 'phone portrait',
    viewport: { width: 390, height: 844 },
    expectedShellMode: 'mobile',
    expectedInputMode: 'touch-only',
    expectTouchOptimizedCopy: true,
  },
  {
    name: 'phone landscape',
    viewport: { width: 844, height: 390 },
    expectedShellMode: 'mobile',
    expectedInputMode: 'touch-only',
    expectTouchOptimizedCopy: true,
  },
  {
    name: 'tablet portrait',
    viewport: { width: 820, height: 1180 },
    expectedShellMode: 'mobile',
    expectedInputMode: 'touch-only',
    expectTouchOptimizedCopy: false,
  },
  {
    name: 'tablet landscape',
    viewport: { width: 1180, height: 820 },
    expectedShellMode: 'desktop',
    expectedInputMode: 'text-input',
    expectTouchOptimizedCopy: false,
  },
] as const;

test.describe('browser e2e nibbles mobile layouts', () => {
  for (const viewportCase of viewportCases) {
    test(`${viewportCase.name} keeps the intro readable`, async ({ page }) => {
      test.slow();
      await page.setViewportSize(viewportCase.viewport);
      await loadNibbles(page);

      await expect(page.getByTestId('app-container')).toHaveAttribute(
        'data-shell-mode',
        viewportCase.expectedShellMode
      );
      await expect(page.getByTestId('terminal-screen')).toHaveAttribute(
        'data-terminal-input-mode',
        viewportCase.expectedInputMode
      );
      await waitForIntro(page, {
        expectTouchCopy: viewportCase.expectTouchOptimizedCopy,
      });
    });
  }

  test('phone portrait can leave the intro with a direct terminal touch and steer right', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await loadNibbles(page);
    await waitForIntro(page, { expectTouchCopy: true });
    await expect(page.getByTestId('terminal-touch-overlay')).toBeVisible();
    await expect
      .poll(() =>
        page.getByTestId('terminal-touch-overlay').evaluate((element) => ({
          touchAction: getComputedStyle(element).touchAction,
          userSelect: getComputedStyle(element).userSelect,
        }))
      )
      .toEqual({
        touchAction: 'none',
        userSelect: 'none',
      });

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: 8,
      col: 4,
      hudMarker: 'Lv:',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });
    expect(gameplayState.text).toContain('S:0  L:5  Lv:1');
    expect(gameplayState.text).not.toContain('Touch to steer');
    expect(gameplayState.text).not.toContain('SCORE:');
    expect(gameplayState.viewportCols).toBe(gameplayState.columns);
    expect(gameplayState.viewportRows).toBe((gameplayState.rows ?? 0) - 1);
    const gameplayLines = (gameplayState.text ?? '').split('\n');
    const portraitBorderLine = '#'.repeat(gameplayState.columns ?? 0);
    const portraitEmptyLine = `#${' '.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}#`;
    expect(gameplayLines[1]).toBe(portraitBorderLine);
    expect(gameplayLines[2]).toBe(portraitEmptyLine);
    expect(gameplayLines.some((line) => line.includes('█'))).toBe(true);
    expect(gameplayLines.at(-1)?.[0]).not.toBe(' ');
    expect(gameplayLines.at(-1)?.at(-1)).not.toBe(' ');

    const terminalRows = gameplayState.rows ?? 0;
    const terminalCols = gameplayState.columns ?? 0;
    const centerGameplayRow = Math.max(2, Math.ceil((terminalRows + 1) / 2));
    const centerGameplayCol = Math.max(2, Math.ceil(terminalCols / 2));

    const rightActivity = await captureTerminalTelemetryAfterInput(page, {
      trigger: () => touchTerminalCell(page, centerGameplayRow, Math.max(2, terminalCols - 2)),
      timeoutMs: 8_000,
      activeRunMs: 1_200,
      requireTouchDispatch: true,
      requireTouchVisual: true,
    });
    expect(rightActivity.latencyMs).toBeLessThan(8_000);
    expect(rightActivity.accepted?.acceptedCount ?? 0).toBeGreaterThan(0);
    await waitForGameplay(page, { hudMarker: 'Lv:' });

    const downActivity = await captureTerminalTelemetryAfterInput(page, {
      trigger: () => touchTerminalCell(page, terminalRows, centerGameplayCol),
      timeoutMs: 8_000,
      activeRunMs: 1_200,
      requireTouchDispatch: true,
      requireTouchVisual: true,
    });
    expect(downActivity.latencyMs).toBeLessThan(8_000);
    expect(downActivity.accepted?.acceptedCount ?? 0).toBeGreaterThan(0);
    expect(downActivity.ack.touchDispatchCount).toBeGreaterThan(0);
  });

  test('phone landscape starts with the landscape gameplay HUD and a wide viewport', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 844, height: 390 });
    await loadNibbles(page);
    await waitForIntro(page, { expectTouchCopy: true });

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: 8,
      col: 7,
      hudMarker: 'Touch',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });
    expect(gameplayState.layoutProfile).toBe(1);
    expect(gameplayState.viewportCols).toBe(gameplayState.columns);
    expect(gameplayState.viewportRows).toBe((gameplayState.rows ?? 0) - 1);
    expect(gameplayState.text).toContain('Touch');
    expect(gameplayState.text).not.toContain('Touch to steer');
    const gameplayLines = (gameplayState.text ?? '').split('\n');
    expect(gameplayLines[1]?.[0]).not.toBe(' ');
    expect(gameplayLines[1]?.at(-1)).not.toBe(' ');

    const rightActivity = await captureTerminalTelemetryAfterInput(page, {
      trigger: () => touchTerminalRelativeDirection(page, 'right'),
      timeoutMs: 8_000,
      activeRunMs: 1_200,
      requireTouchDispatch: true,
      requireTouchVisual: true,
    });
    expect(rightActivity.latencyMs).toBeLessThan(8_000);
    expect(rightActivity.accepted?.acceptedCount ?? 0).toBeGreaterThan(0);
    expect(rightActivity.ack.touchVisualCount).toBeGreaterThan(0);
  });
});
