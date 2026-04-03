import { expect, test } from '@playwright/test';
import {
  captureTerminalTelemetryAfterInput,
  loadNibbles,
  scheduleDeferredGameplayInput,
  startGameplayFromIntroTouch,
  waitForTerminalText,
} from './nibblesE2eHelpers';

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
    const introText = await waitForTerminalText(
      page,
      ['Difficulty', 'Movement Keys', 'EASY', 'INSANE'],
      60_000
    );

    expect(introText).toContain('Difficulty');
    expect(introText).toContain('smysnk.com');
    expect(introText).toContain('Joshua Bellamy');
    await expect(page.getByLabel('IDE status bar')).toContainText(/waiting/i, {
      timeout: 15_000,
    });

    console.info(`Nibbles intro screen reached in ${Date.now() - introStartedAt}ms`);

    const gameplayState = await startGameplayFromIntroTouch(page, {
      row: 10,
      col: 8,
      hudMarker: ['SCORE:', 'S:'],
      gameplayTimeoutMs: 60_000,
      dispatchStrategy: 'runtime',
    });
    console.info('Nibbles gameplay transition reached');
    const gameText = gameplayState.text ?? '';
    expect(gameText.includes('SCORE:') || gameText.includes('S:')).toBe(true);
    expect(gameText.includes('LEVEL:') || gameText.includes('Lv:')).toBe(true);
    expect(gameText).toContain('smysnk.com');
  });

  test('responds to keyboard input after gameplay starts', async ({ page }) => {
    test.slow();

    await loadNibbles(page, {
      useFileExplorer: true,
      speed: '1',
    });
    await waitForTerminalText(page, ['Difficulty', 'Movement Keys', 'EASY', 'INSANE'], 60_000);
    await scheduleDeferredGameplayInput(page, ['ArrowDown'], ['SCORE:', 'S:']);

    const activity = await captureTerminalTelemetryAfterInput(page, {
      trigger: () =>
        startGameplayFromIntroTouch(page, {
          row: 10,
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
});
