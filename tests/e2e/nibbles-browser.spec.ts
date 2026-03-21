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
    const terminalScreen = page.getByTestId('terminal-screen');
    const fileExplorerTab = page.getByRole('button', { name: /open file explorer/i });
    const runButton = page.getByRole('button', { name: /run program/i });
    const speedInput = page.getByLabel('Speed (x)');

    await expect(terminalTab).toHaveAttribute('aria-selected', 'true');
    await expect(terminalScreen).toBeVisible();

    const terminalBounds = await terminalScreen.boundingBox();
    expect(terminalBounds?.width ?? 0).toBeGreaterThan(200);
    expect(terminalBounds?.height ?? 0).toBeGreaterThan(200);

    await fileExplorerTab.hover();
    await page.getByRole('button', { name: /nibbles\.asm/i }).click();
    await speedInput.fill('8');
    await runButton.click();

    const introStartedAt = Date.now();

    await expect
      .poll(
        async () => {
          const terminalText = await readTerminalText(page);

          return {
            hasMovementKeys: terminalText.includes('Movement Keys'),
            hasProgrammedBy: terminalText.includes('Programmed By Josh Henn'),
            hasEasy: terminalText.includes('Easy') || terminalText.includes('EASY'),
            hasMedium: terminalText.includes('Medium') || terminalText.includes('MEDIUM'),
            hasHard: terminalText.includes('Hard') || terminalText.includes('HARD'),
            hasInsane: terminalText.includes('Insane') || terminalText.includes('INSANE'),
          };
        },
        {
          timeout: 60_000,
          intervals: [250, 500, 1_000, 2_000],
        }
      )
      .toEqual({
        hasMovementKeys: true,
        hasProgrammedBy: true,
        hasEasy: true,
        hasMedium: true,
        hasHard: true,
        hasInsane: true,
      });

    const introText = await readTerminalText(page);
    expect(introText).toContain('Programmed By Josh Henn');
    await expect(page.getByLabel('IDE status bar')).toContainText(/waiting for input/i, {
      timeout: 15_000,
    });

    console.info(`Nibbles intro screen reached in ${Date.now() - introStartedAt}ms`);

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

    await terminalScreen.screenshot({
      path: testInfo.outputPath('nibbles-game-screen.png'),
    });
  });
});
