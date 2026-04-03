import { describe, expect, it } from 'vitest';
import {
  DESKTOP_GAMEPLAY_FRAME_BUDGET_MS,
  DESKTOP_GAMEPLAY_PULSE_FRAME_BUDGET_MS,
  MOBILE_GAMEPLAY_FRAME_BUDGET_MS,
  MOBILE_GAMEPLAY_PULSE_FRAME_BUDGET_MS,
  resolveWorkerFrameBudgetMs,
  resolveWorkerPulseFrameBudgetMs,
  shouldUseTerminalFocusedWorkerProfile,
} from '@/runtime/workerExecutionPolicy';

describe('workerExecutionPolicy', () => {
  it('preserves explicit environment frame budgets', () => {
    expect(
      resolveWorkerFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: true,
        environmentFrameBudgetMs: 24,
      })
    ).toBe(24);
  });

  it('uses a shorter desktop gameplay budget for Nibbles in terminal view', () => {
    expect(
      resolveWorkerFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: false,
      })
    ).toBe(DESKTOP_GAMEPLAY_FRAME_BUDGET_MS);
  });

  it('uses a shorter mobile gameplay budget for touch-only Nibbles terminal play', () => {
    expect(
      resolveWorkerFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: true,
      })
    ).toBe(MOBILE_GAMEPLAY_FRAME_BUDGET_MS);
  });

  it('does not force a gameplay budget outside the Nibbles terminal view', () => {
    expect(
      resolveWorkerFrameBudgetMs({
        activeFileId: 'workspace:scratch.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: false,
      })
    ).toBeUndefined();

    expect(
      resolveWorkerFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'code',
        terminalInputModePreference: 'auto',
        isCompactShell: false,
      })
    ).toBeUndefined();
  });

  it('uses smaller one-shot pulse budgets for live gameplay input', () => {
    expect(
      resolveWorkerPulseFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: false,
      })
    ).toBe(DESKTOP_GAMEPLAY_PULSE_FRAME_BUDGET_MS);

    expect(
      resolveWorkerPulseFrameBudgetMs({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: true,
      })
    ).toBe(MOBILE_GAMEPLAY_PULSE_FRAME_BUDGET_MS);
  });

  it('only enables the terminal-focused worker profile for Nibbles terminal play', () => {
    expect(
      shouldUseTerminalFocusedWorkerProfile({
        activeFileId: 'example:nibbles.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: true,
      })
    ).toBe(true);

    expect(
      shouldUseTerminalFocusedWorkerProfile({
        activeFileId: 'workspace:scratch.asm',
        workspaceTab: 'terminal',
        terminalInputModePreference: 'auto',
        isCompactShell: true,
      })
    ).toBe(false);
  });
});
