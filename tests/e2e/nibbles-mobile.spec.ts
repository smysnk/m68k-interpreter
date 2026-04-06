import { expect, test } from '@playwright/test';
import {
  captureTerminalTelemetryAfterInput,
  loadNibbles,
  readTerminalSnapshot,
  startGameplayFromIntroTouch,
  touchTerminalCell,
  touchTerminalRelativeDirection,
  waitForGameplay,
  waitForIntro,
  waitForMotionAfterInput,
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

function lineHasAnyBackground(
  cells: Array<{ background: number | null }>
): boolean {
  return cells.some((cell) => cell.background !== null);
}

function findLineIndex(lines: string[], marker: string): number {
  return lines.findIndex((line) => line.includes(marker));
}

function axisForDirection(direction: number): 'horizontal' | 'vertical' {
  return direction === 0 || direction === 1 ? 'horizontal' : 'vertical';
}

function clampGameplayRow(value: number, rows: number): number {
  return Math.max(2, Math.min(Math.max(rows - 1, 2), value));
}

function clampGameplayCol(value: number, cols: number): number {
  return Math.max(2, Math.min(Math.max(cols - 1, 2), value));
}

function expectMarkerCentered(lines: string[], columns: number, marker: string): void {
  const row = findLineIndex(lines, marker);
  expect(row).toBeGreaterThanOrEqual(0);
  expect(lines[row]?.indexOf(marker)).toBe(Math.floor((columns - marker.length) / 2));
}

function getMenuTouchTarget(
  lines: string[],
  label: string
): { row: number; col: number; labelRow: number; labelCol: number } {
  const labelRow = findLineIndex(lines, label);
  expect(labelRow).toBeGreaterThanOrEqual(0);
  const labelCol = lines[labelRow]!.indexOf(label);
  expect(labelCol).toBeGreaterThanOrEqual(0);
  return {
    row: labelRow,
    col: Math.max(2, labelCol - 1),
    labelRow,
    labelCol,
  };
}

function getButtonBounds(lines: string[], label: string): {
  row: number;
  leftBorder: number;
  rightBorder: number;
  topRow: number;
  bottomRow: number;
} {
  const row = findLineIndex(lines, label);
  expect(row).toBeGreaterThanOrEqual(0);
  const labelCol = lines[row]!.indexOf(label);
  expect(labelCol).toBeGreaterThanOrEqual(0);
  const leftBorder = lines[row]!.lastIndexOf('│', labelCol);
  const rightBorder = lines[row]!.indexOf('│', labelCol + label.length);
  expect(leftBorder).toBeGreaterThanOrEqual(0);
  expect(rightBorder).toBeGreaterThan(leftBorder);
  expect(lines[row - 1]?.slice(leftBorder, rightBorder + 1)).toBe(
    `┌${'─'.repeat(rightBorder - leftBorder - 1)}┐`
  );
  expect(lines[row + 1]?.slice(leftBorder, rightBorder + 1)).toBe(
    `└${'─'.repeat(rightBorder - leftBorder - 1)}┘`
  );
  return {
    row,
    leftBorder,
    rightBorder,
    topRow: row - 1,
    bottomRow: row + 1,
  };
}

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

      const introSnapshot = await readTerminalSnapshot(page);
      expect(introSnapshot).not.toBeNull();
      const safeIntroSnapshot = introSnapshot!;
      const introTopBorder = `┌${'─'.repeat(Math.max(safeIntroSnapshot.columns - 2, 0))}┐`;
      const introBottomBorder = `└${'─'.repeat(Math.max(safeIntroSnapshot.columns - 2, 0))}┘`;
      const selectedDifficultyRow = safeIntroSnapshot.lines.findIndex((line) =>
        line.includes('MEDIUM')
      );
      const easyButton = getButtonBounds(safeIntroSnapshot.lines, 'EASY');
      const mediumButton = getButtonBounds(safeIntroSnapshot.lines, 'MEDIUM');
      const hardButton = getButtonBounds(safeIntroSnapshot.lines, 'HARD');
      const insaneButton = getButtonBounds(safeIntroSnapshot.lines, 'INSANE');
      const selectLabelRow = findLineIndex(safeIntroSnapshot.lines, 'SELECT DIFFICULTY');
      const introBackgroundRows = safeIntroSnapshot.cells
        .map((row, index) => (lineHasAnyBackground(row) ? index : -1))
        .filter((index) => index >= 0);

      expect(safeIntroSnapshot.lines[0]).toBe(introTopBorder);
      expect(safeIntroSnapshot.lines[safeIntroSnapshot.rows - 1]).toBe(introBottomBorder);
      expect(selectedDifficultyRow).toBeGreaterThanOrEqual(0);
      expectMarkerCentered(safeIntroSnapshot.lines, safeIntroSnapshot.columns, 'NIBBLES');
      expectMarkerCentered(
        safeIntroSnapshot.lines,
        safeIntroSnapshot.columns,
        safeIntroSnapshot.lines.some((line) => line.includes('NEON SERPENT ARCADE'))
          ? 'NEON SERPENT ARCADE'
          : 'NEON SERPENT'
      );
      expectMarkerCentered(
        safeIntroSnapshot.lines,
        safeIntroSnapshot.columns,
        'SELECT DIFFICULTY'
      );
      if (viewportCase.expectedInputMode === 'touch-only') {
        expect(easyButton.leftBorder - 1).toBeLessThan(mediumButton.leftBorder);
        expect(mediumButton.leftBorder - easyButton.rightBorder).toBeGreaterThan(1);
        expect(hardButton.topRow - easyButton.bottomRow).toBeGreaterThan(1);
        expect(insaneButton.leftBorder - hardButton.rightBorder).toBeGreaterThan(1);
        expect(easyButton.topRow - selectLabelRow).toBeGreaterThan(1);
      } else {
        const easyRow = findLineIndex(safeIntroSnapshot.lines, 'EASY');
        const mediumRow = findLineIndex(safeIntroSnapshot.lines, 'MEDIUM');
        const hardRow = findLineIndex(safeIntroSnapshot.lines, 'HARD');
        const insaneRow = findLineIndex(safeIntroSnapshot.lines, 'INSANE');
        expect(easyRow).toBeGreaterThanOrEqual(0);
        expect(easyRow - selectLabelRow).toBeGreaterThan(1);
        expect(mediumRow - easyRow).toBeGreaterThan(1);
        expect(hardRow - mediumRow).toBeGreaterThan(1);
        expect(insaneRow - hardRow).toBeGreaterThan(1);
      }
      expect(introBackgroundRows).toEqual([selectedDifficultyRow]);
      expect(safeIntroSnapshot.cursorVisible).toBe(false);
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

    const introSnapshot = await readTerminalSnapshot(page);
    expect(introSnapshot).not.toBeNull();
    const easyTarget = getMenuTouchTarget(introSnapshot!.lines, 'EASY');
    const easyBounds = getButtonBounds(introSnapshot!.lines, 'EASY');
    expect(easyTarget.row).toBe(easyBounds.row);

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: easyTarget.row,
      col: easyTarget.col,
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
    const portraitTopBorder = `┌${'─'.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}┐`;
    const portraitEmptyLine = `│${' '.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}│`;
    const portraitBottomBorder = `└${'─'.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}┘`;
    expect(gameplayLines[0]).toBe(portraitTopBorder);
    expect(gameplayLines[1]).toBe(portraitEmptyLine);
    expect(gameplayLines.some((line) => line.includes('█'))).toBe(true);
    expect(gameplayLines.at(-2)).toBe(portraitBottomBorder);
    expect(gameplayLines.at(-1)).toContain('S:0  L:5  Lv:1');

    const gameplaySnapshot = await readTerminalSnapshot(page);
    expect(gameplaySnapshot).not.toBeNull();
    const safeGameplaySnapshot = gameplaySnapshot!;
    const hudRowIndex = safeGameplaySnapshot.rows - 1;
    const bottomWallRowIndex = safeGameplaySnapshot.rows - 2;
    const hudLine = safeGameplaySnapshot.lines[hudRowIndex] ?? '';
    const scoreIndex = hudLine.indexOf('S:');
    const livesIndex = hudLine.indexOf('L:');
    const levelIndex = hudLine.indexOf('Lv:');
    expect(safeGameplaySnapshot.lines[bottomWallRowIndex]).toBe(portraitBottomBorder);
    expect(safeGameplaySnapshot.cells.flat().every((cell) => cell.background === null)).toBe(true);
    expect(safeGameplaySnapshot.cursorVisible).toBe(false);
    expect(safeGameplaySnapshot.cells[0]?.[0]).toMatchObject({
      char: '┌',
      foreground: 36,
      bold: true,
    });
    expect(scoreIndex).toBeGreaterThanOrEqual(0);
    expect(livesIndex).toBeGreaterThanOrEqual(0);
    expect(levelIndex).toBeGreaterThanOrEqual(0);
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[scoreIndex]).toMatchObject({
      char: 'S',
      foreground: 36,
    });
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[livesIndex]).toMatchObject({
      char: 'L',
      foreground: 35,
    });
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[levelIndex]).toMatchObject({
      char: 'L',
      foreground: 36,
    });

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

    const landscapeIntroSnapshot = await readTerminalSnapshot(page);
    expect(landscapeIntroSnapshot).not.toBeNull();
    const landscapeEasyTarget = getMenuTouchTarget(landscapeIntroSnapshot!.lines, 'EASY');

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: landscapeEasyTarget.row,
      col: landscapeEasyTarget.col,
      hudMarker: 'Lv:',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });
    expect(gameplayState.layoutProfile).toBe(1);
    expect(gameplayState.viewportCols).toBe(gameplayState.columns);
    expect(gameplayState.viewportRows).toBe((gameplayState.rows ?? 0) - 1);
    expect(gameplayState.text).toContain('S:0  L:5  Lv:1');
    const gameplayLines = (gameplayState.text ?? '').split('\n');
    expect(gameplayLines[0]).toBe(`┌${'─'.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}┐`);
    expect(gameplayLines.at(-2)).toBe(
      `└${'─'.repeat(Math.max((gameplayState.columns ?? 0) - 2, 0))}┘`
    );
    expect(gameplayLines.at(-1)).toContain('S:0  L:5  Lv:1');

    const landscapeGameplaySnapshot = await readTerminalSnapshot(page);
    expect(landscapeGameplaySnapshot).not.toBeNull();
    expect(landscapeGameplaySnapshot!.cells.flat().every((cell) => cell.background === null)).toBe(
      true
    );
    expect(landscapeGameplaySnapshot!.cursorVisible).toBe(false);

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

  test('phone portrait steers from varied touch positions and alternates axis on each tap', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await loadNibbles(page);
    await waitForIntro(page, { expectTouchCopy: true });

    const introSnapshot = await readTerminalSnapshot(page);
    expect(introSnapshot).not.toBeNull();
    const easyTarget = getMenuTouchTarget(introSnapshot!.lines, 'EASY');

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: easyTarget.row,
      col: easyTarget.col,
      hudMarker: 'Lv:',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });

    const rows = gameplayState.rows ?? 0;
    const cols = gameplayState.columns ?? 0;
    const variedTargets = [
      {
        name: 'broad right lane',
        row: clampGameplayRow(Math.ceil(rows * 0.58), rows),
        col: clampGameplayCol(Math.ceil(cols * 0.82), cols),
        expectedDirection: 1,
      },
      {
        name: 'upper-left rebound lane',
        row: clampGameplayRow(Math.ceil(rows * 0.22), rows),
        col: clampGameplayCol(Math.ceil(cols * 0.18), cols),
        expectedDirection: 2,
      },
      {
        name: 'lower-right lane',
        row: clampGameplayRow(Math.ceil(rows * 0.67), rows),
        col: clampGameplayCol(Math.ceil(cols * 0.76), cols),
        expectedDirection: 1,
      },
      {
        name: 'lower-left rebound lane',
        row: clampGameplayRow(Math.ceil(rows * 0.82), rows),
        col: clampGameplayCol(Math.ceil(cols * 0.22), cols),
        expectedDirection: 3,
      },
    ] as const;

    let previousAxis: 'horizontal' | 'vertical' | null = null;

    for (const target of variedTargets) {
      const motion = await waitForMotionAfterInput(page, {
        trigger: () => touchTerminalCell(page, target.row, target.col),
        expectedDirection: target.expectedDirection,
        timeoutMs: 8_000,
      });

      expect(motion.latencyMs).toBeLessThan(8_000);
      const observedDirection = motion.after.lastDirection ?? motion.after.direction;
      expect(observedDirection).toBe(target.expectedDirection);
      const nextAxis = axisForDirection(observedDirection ?? target.expectedDirection);
      if (previousAxis !== null) {
        expect(nextAxis).not.toBe(previousAxis);
      }
      previousAxis = nextAxis;
    }
  });

  test('resizing after gameplay returns mobile players to the intro with a recalculated border', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await loadNibbles(page);
    await waitForIntro(page, { expectTouchCopy: true });

    const introSnapshot = await readTerminalSnapshot(page);
    expect(introSnapshot).not.toBeNull();
    const mediumTarget = getMenuTouchTarget(introSnapshot!.lines, 'MEDIUM');

    await startGameplayFromIntroTouch(page, {
      row: mediumTarget.row,
      col: mediumTarget.col,
      hudMarker: 'Lv:',
      maxAttempts: 3,
      gameplayTimeoutMs: 8_000,
    });

    await page.setViewportSize({ width: 844, height: 390 });
    await waitForIntro(page, {
      expectTouchCopy: true,
      timeoutMs: 60_000,
    });

    const resizedIntroSnapshot = await readTerminalSnapshot(page);
    expect(resizedIntroSnapshot).not.toBeNull();
    const safeResizedIntroSnapshot = resizedIntroSnapshot!;
    const resizedTopBorder = `┌${'─'.repeat(Math.max(safeResizedIntroSnapshot.columns - 2, 0))}┐`;
    const resizedBottomBorder = `└${'─'.repeat(Math.max(safeResizedIntroSnapshot.columns - 2, 0))}┘`;
    const resizedSelectedDifficultyRow = safeResizedIntroSnapshot.lines.findIndex((line) =>
      line.includes('MEDIUM')
    );
    const resizedBackgroundRows = safeResizedIntroSnapshot.cells
      .map((row, index) => (lineHasAnyBackground(row) ? index : -1))
      .filter((index) => index >= 0);

    expect(safeResizedIntroSnapshot.lines[0]).toBe(resizedTopBorder);
    expect(safeResizedIntroSnapshot.lines[safeResizedIntroSnapshot.rows - 1]).toBe(
      resizedBottomBorder
    );
    expect(resizedSelectedDifficultyRow).toBeGreaterThanOrEqual(0);
    expect(resizedBackgroundRows).toEqual([resizedSelectedDifficultyRow]);
    expect(safeResizedIntroSnapshot.cursorVisible).toBe(false);
  });
});
