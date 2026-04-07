import { expect, test } from '@playwright/test';
import {
  captureTerminalTelemetryAfterInput,
  loadNibbles,
  readTerminalSnapshot,
  scheduleDeferredGameplayInput,
  startGameplayFromIntroTouch,
  waitForIntro,
} from './nibblesE2eHelpers';

function findLineIndex(lines: string[], marker: string): number {
  return lines.findIndex((line) => line.includes(marker));
}

function lineHasForeground(
  cells: Array<{ char: string; foreground: number | null }>,
  foreground: number
): boolean {
  return cells.some((cell) => cell.char.trim().length > 0 && cell.foreground === foreground);
}

function lineHasBackground(
  cells: Array<{ char: string; background: number | null }>,
  background: number
): boolean {
  return cells.some((cell) => cell.char.trim().length > 0 && cell.background === background);
}

function lineHasAnyBackground(
  cells: Array<{ background: number | null }>
): boolean {
  return cells.some((cell) => cell.background !== null);
}

function expectMarkerAtPosition(
  lines: string[],
  marker: string,
  row: number,
  column: number
): void {
  expect(lines[row]).toContain(marker);
  expect(lines[row]?.indexOf(marker)).toBe(column);
}

test.describe('browser e2e nibbles', () => {
  test('renders the intro menu and reaches gameplay in the real browser terminal display', async ({
    page,
  }) => {
    test.slow();

    const terminalTab = page.getByRole('tab', { name: /terminal/i });
    const terminalScreen = page.getByTestId('terminal-screen');

    await loadNibbles(page, {
      useFileExplorer: true,
      speed: '1',
    });
    await expect(terminalTab).toHaveAttribute('aria-selected', 'true');
    await expect(terminalScreen).toBeVisible();

    const terminalBounds = await terminalScreen.boundingBox();
    expect(terminalBounds?.width ?? 0).toBeGreaterThan(200);
    expect(terminalBounds?.height ?? 0).toBeGreaterThan(200);

    const introStartedAt = Date.now();
    const introText = await waitForIntro(page, {
      expectTouchCopy: false,
      timeoutMs: 60_000,
    });

    expect(introText).toContain('NIBBLES');
    expect(introText).toContain('SELECT DIFFICULTY');
    expect(introText).toContain('EASY');
    expect(introText).toContain('INSANE');
    expect(/NEON SERPENT/.test(introText)).toBe(true);

    const introSnapshot = await readTerminalSnapshot(page);
    expect(introSnapshot).not.toBeNull();
    const safeIntroSnapshot = introSnapshot!;
    const titleRow = findLineIndex(safeIntroSnapshot.lines, 'NIBBLES');
    const subtitle = safeIntroSnapshot.lines.some((line) => line.includes('NEON SERPENT ARCADE'))
      ? 'NEON SERPENT ARCADE'
      : 'NEON SERPENT';
    const subtitleRow = findLineIndex(safeIntroSnapshot.lines, subtitle);
    const touchHintRow = findLineIndex(
      safeIntroSnapshot.lines,
      'Touch a row or use W / S + Enter'
    );
    const selectLabelRow = findLineIndex(safeIntroSnapshot.lines, 'SELECT DIFFICULTY');
    const mediumRow = findLineIndex(safeIntroSnapshot.lines, 'MEDIUM');
    const selectedDifficultyRow = findLineIndex(safeIntroSnapshot.lines, 'MEDIUM');
    const easyRow = findLineIndex(safeIntroSnapshot.lines, 'EASY');
    const hardRow = findLineIndex(safeIntroSnapshot.lines, 'HARD');
    const insaneRow = findLineIndex(safeIntroSnapshot.lines, 'INSANE');
    const introBackgroundRows = safeIntroSnapshot.cells
      .map((row, index) => (lineHasAnyBackground(row) ? index : -1))
      .filter((index) => index >= 0);
    const introTopBorder = `┌${'─'.repeat(Math.max(safeIntroSnapshot.columns - 2, 0))}┐`;
    const introBottomBorder = `└${'─'.repeat(Math.max(safeIntroSnapshot.columns - 2, 0))}┘`;
    expect(titleRow).toBeGreaterThanOrEqual(0);
    expect(subtitleRow).toBeGreaterThanOrEqual(0);
    expect(selectedDifficultyRow).toBeGreaterThanOrEqual(0);
    expect(easyRow).toBeGreaterThanOrEqual(0);
    expect(hardRow).toBeGreaterThanOrEqual(0);
    expect(insaneRow).toBeGreaterThanOrEqual(0);
    expect(safeIntroSnapshot.lines[0]).toBe(introTopBorder);
    expect(safeIntroSnapshot.lines[safeIntroSnapshot.rows - 1]).toBe(introBottomBorder);
    expect(safeIntroSnapshot.lines[1]?.[0]).toBe('│');
    expect(safeIntroSnapshot.lines[1]?.[safeIntroSnapshot.columns - 1]).toBe('│');
    expect(titleRow).toBe(1);
    expect(subtitleRow).toBe(2);
    expect(touchHintRow).toBe(4);
    expect(selectLabelRow).toBe(6);
    expectMarkerAtPosition(safeIntroSnapshot.lines, 'NIBBLES', 1, 26);
    expectMarkerAtPosition(safeIntroSnapshot.lines, subtitle, 2, 21);
    expectMarkerAtPosition(
      safeIntroSnapshot.lines,
      'Touch a row or use W / S + Enter',
      4,
      13
    );
    expectMarkerAtPosition(safeIntroSnapshot.lines, 'SELECT DIFFICULTY', 6, 10);
    expectMarkerAtPosition(safeIntroSnapshot.lines, 'smysnk.com', 21, 3);
    expectMarkerAtPosition(safeIntroSnapshot.lines, 'Joshua Bellamy', 22, 3);
    expect(easyRow - selectLabelRow).toBeGreaterThan(1);
    expect(mediumRow - easyRow).toBeGreaterThan(1);
    expect(hardRow - mediumRow).toBeGreaterThan(1);
    expect(insaneRow - hardRow).toBeGreaterThan(1);
    expect(lineHasForeground(safeIntroSnapshot.cells[titleRow] ?? [], 35)).toBe(true);
    expect(lineHasForeground(safeIntroSnapshot.cells[subtitleRow] ?? [], 36)).toBe(true);
    expect(lineHasBackground(safeIntroSnapshot.cells[selectedDifficultyRow] ?? [], 45)).toBe(true);
    expect(lineHasAnyBackground(safeIntroSnapshot.cells[easyRow] ?? [])).toBe(false);
    expect(lineHasAnyBackground(safeIntroSnapshot.cells[hardRow] ?? [])).toBe(false);
    expect(lineHasAnyBackground(safeIntroSnapshot.cells[insaneRow] ?? [])).toBe(false);
    expect(introBackgroundRows).toEqual([selectedDifficultyRow]);
    expect(safeIntroSnapshot.cursorVisible).toBe(false);
    await expect(page.getByLabel('IDE status bar')).toContainText(/waiting/i, {
      timeout: 15_000,
    });

    console.info(`Nibbles intro screen reached in ${Date.now() - introStartedAt}ms`);

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: 11,
      col: 8,
      hudMarker: ['SCORE:', 'S:'],
      gameplayTimeoutMs: 60_000,
      dispatchStrategy: 'runtime',
    });
    console.info('Nibbles gameplay transition reached');
    const gameText = gameplayState.text ?? '';
    expect(gameText.includes('SCORE:') || gameText.includes('S:')).toBe(true);
    expect(gameText.includes('LIVES:') || gameText.includes('L:')).toBe(true);
    expect(gameText.includes('LEVEL:') || gameText.includes('Lv:')).toBe(true);

    const gameplaySnapshot = await readTerminalSnapshot(page);
    expect(gameplaySnapshot).not.toBeNull();
    const safeGameplaySnapshot = gameplaySnapshot!;
    const topBorder = `┌${'─'.repeat(Math.max(safeGameplaySnapshot.columns - 2, 0))}┐`;
    const bottomBorder = `└${'─'.repeat(Math.max(safeGameplaySnapshot.columns - 2, 0))}┘`;
    const hudRowIndex = safeGameplaySnapshot.rows - 1;
    const bottomWallRowIndex = safeGameplaySnapshot.rows - 2;
    const hudLine = safeGameplaySnapshot.lines[hudRowIndex] ?? '';
    const scoreLabelIndex = hudLine.indexOf('SCORE:');
    const livesLabelIndex = hudLine.indexOf('LIVES:');
    const levelLabelIndex = hudLine.indexOf('LEVEL:');

    expect(safeGameplaySnapshot.lines[0]).toBe(topBorder);
    expect(safeGameplaySnapshot.lines[1]?.startsWith('│')).toBe(true);
    expect(safeGameplaySnapshot.lines[1]?.endsWith('│')).toBe(true);
    expect(safeGameplaySnapshot.lines[bottomWallRowIndex]).toBe(bottomBorder);
    expect(hudLine).toContain('SCORE:');
    expect(hudLine).toContain('LIVES:');
    expect(hudLine).toContain('LEVEL:');
    expect(safeGameplaySnapshot.cells.flat().every((cell) => cell.background === null)).toBe(true);
    expect(safeGameplaySnapshot.cursorVisible).toBe(false);
    expect(safeGameplaySnapshot.cells[0]?.[0]).toMatchObject({
      char: '┌',
      foreground: 36,
      bold: true,
    });
    expect(scoreLabelIndex).toBeGreaterThanOrEqual(0);
    expect(livesLabelIndex).toBeGreaterThanOrEqual(0);
    expect(levelLabelIndex).toBeGreaterThanOrEqual(0);
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[scoreLabelIndex]).toMatchObject({
      char: 'S',
      foreground: 36,
    });
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[livesLabelIndex]).toMatchObject({
      char: 'L',
      foreground: 35,
    });
    expect(safeGameplaySnapshot.cells[hudRowIndex]?.[levelLabelIndex]).toMatchObject({
      char: 'L',
      foreground: 36,
    });
  });

  test('responds to keyboard input after gameplay starts', async ({ page }) => {
    test.slow();

    await loadNibbles(page, {
      useFileExplorer: true,
      speed: '1',
    });
    await waitForIntro(page, {
      expectTouchCopy: false,
      timeoutMs: 60_000,
    });
    await scheduleDeferredGameplayInput(page, ['ArrowDown'], ['SCORE:', 'S:']);

    const activity = await captureTerminalTelemetryAfterInput(page, {
      trigger: () =>
        startGameplayFromIntroTouch(page, {
          row: 11,
          col: 8,
          hudMarker: ['SCORE:', 'S:'],
          gameplayTimeoutMs: 60_000,
          dispatchStrategy: 'runtime',
        }),
      triggerTimeoutMs: 60_000,
      timeoutMs: 60_000,
      activeRunMs: 1_200,
    });
    console.info(`Nibbles gameplay telemetry latency ${activity.latencyMs}ms`);
    expect(activity.latencyMs).toBeLessThan(60_000);
    expect(activity.accepted?.acceptedCount ?? 0).toBeGreaterThan(0);
    expect(activity.ack.repaintCount).toBeGreaterThan(0);
    expect(activity.ack.frameEventsReceived).toBeGreaterThan(0);
  });

  test('resizing during gameplay returns to the intro and redraws the border to the new geometry', async ({
    page,
  }) => {
    test.slow();

    await page.setViewportSize({ width: 1280, height: 720 });
    await loadNibbles(page, {
      useFileExplorer: true,
      speed: '1',
    });
    await waitForIntro(page, { expectTouchCopy: false });

    await startGameplayFromIntroTouch(page, {
      row: 11,
      col: 8,
      hudMarker: ['SCORE:', 'S:'],
      gameplayTimeoutMs: 60_000,
      dispatchStrategy: 'runtime',
    });

    await page.setViewportSize({ width: 1500, height: 900 });
    await waitForIntro(page, {
      expectTouchCopy: false,
      timeoutMs: 60_000,
    });

    const resizedIntroSnapshot = await readTerminalSnapshot(page);
    expect(resizedIntroSnapshot).not.toBeNull();
    const safeResizedIntroSnapshot = resizedIntroSnapshot!;
    const resizedTopBorder = `┌${'─'.repeat(Math.max(safeResizedIntroSnapshot.columns - 2, 0))}┐`;
    const resizedBottomBorder = `└${'─'.repeat(Math.max(safeResizedIntroSnapshot.columns - 2, 0))}┘`;
    const resizedSelectedRow = findLineIndex(safeResizedIntroSnapshot.lines, 'MEDIUM');
    const resizedBackgroundRows = safeResizedIntroSnapshot.cells
      .map((row, index) => (lineHasAnyBackground(row) ? index : -1))
      .filter((index) => index >= 0);

    expect(safeResizedIntroSnapshot.lines[0]).toBe(resizedTopBorder);
    expect(safeResizedIntroSnapshot.lines[safeResizedIntroSnapshot.rows - 1]).toBe(
      resizedBottomBorder
    );
    expect(resizedSelectedRow).toBeGreaterThanOrEqual(0);
    expect(resizedBackgroundRows).toEqual([resizedSelectedRow]);
    expect(safeResizedIntroSnapshot.cursorVisible).toBe(false);
  });
});
