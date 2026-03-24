import { expect, test, type Page } from '@playwright/test';

async function readTerminalText(page: Page): Promise<string> {
  return page.getByTestId('terminal-screen').evaluate((element) => {
    const lines = Array.from(element.querySelectorAll('.retro-lcd__line'));

    return lines
      .map((line) =>
        Array.from(line.querySelectorAll('.retro-lcd__cell'))
          .map((cell) => {
            const text = cell.textContent ?? '';
            return text === '\u00a0' ? ' ' : text;
          })
          .join('')
      )
      .join('\n');
  });
}

test.describe('browser e2e nibbles', () => {
  test('renders the intro menu and game screen in the real browser terminal display', async ({
    page,
  }, testInfo) => {
    test.slow();

    await page.goto('/');

    const terminalTab = page.getByRole('tab', { name: /terminal/i });
    const codeTab = page.getByRole('tab', { name: /code/i });
    const terminalScreen = page.getByTestId('terminal-screen');
    const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
    const nibblesFileButton = page.getByRole('button', { name: /nibbles\.asm/i });
    const runButton = page.getByRole('button', { name: /run program/i });
    const speedInput = page.getByLabel('Speed (x)');

    await expect(terminalTab).toHaveAttribute('aria-selected', 'true');
    await expect(terminalScreen).toBeVisible();

    const terminalBounds = await terminalScreen.boundingBox();
    expect(terminalBounds?.width ?? 0).toBeGreaterThan(200);
    expect(terminalBounds?.height ?? 0).toBeGreaterThan(200);

    await fileExplorerTab.hover();
    await nibblesFileButton.click();
    await expect(codeTab).toHaveAttribute('aria-selected', 'true');
    await expect(nibblesFileButton).toHaveAttribute('aria-pressed', 'true');
    await speedInput.fill('8');
    await runButton.click();
    await expect(terminalTab).toHaveAttribute('aria-selected', 'true');

    const introStartedAt = Date.now();

    await expect
      .poll(
        async () => {
          const terminalText = await readTerminalText(page);

          return {
            hasDifficulty: /difficulty/i.test(terminalText),
            hasMovementKeys: /movement\s+keys/i.test(terminalText),
            hasProgrammedBy: /programmed\s+by\s+joshua\s+bellamy/i.test(terminalText),
            hasEasy: /\beasy\b/i.test(terminalText),
            hasInsane: /\binsane\b/i.test(terminalText),
          };
        },
        {
          timeout: 60_000,
          intervals: [250, 500, 1_000, 2_000],
        }
      )
      .toEqual({
        hasDifficulty: true,
        hasMovementKeys: true,
        hasProgrammedBy: true,
        hasEasy: true,
        hasInsane: true,
      });

    const introText = await readTerminalText(page);
    expect(introText).toContain('Programmed By Joshua Bellamy');
    expect(introText).toContain('▓▓▓');
    expect(introText).toContain('│');
    expect(introText).toContain('┌');
    expect(introText).toContain('┐');
    expect(introText).toContain('└');
    expect(introText).toContain('┘');
    expect(introText).not.toContain('ý');
    await expect(page.getByLabel('IDE status bar')).toContainText(/waiting/i, {
      timeout: 15_000,
    });

    console.info(`Nibbles intro screen reached in ${Date.now() - introStartedAt}ms`);

    await terminalScreen.click();
    await page.keyboard.press('s');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => readTerminalText(page), {
        timeout: 60_000,
        intervals: [250, 500, 1_000, 2_000],
      })
      .toContain('SCORE:');

    const gameText = await readTerminalText(page);
    expect(gameText).toContain('SCORE:');
    expect(gameText).toMatch(/LIV\s*ES:/);
    expect(gameText).toContain('LEVEL:');
    expect(gameText).toContain('┌');
    expect(gameText).toContain('┐');
    expect(gameText).toContain('└');
    expect(gameText).toContain('┘');
    expect(gameText).toContain('─');
    expect(gameText).toContain('│');
    expect(gameText).not.toContain('ý');

    await terminalScreen.screenshot({
      path: testInfo.outputPath('nibbles-game-screen.png'),
    });
  });
});
