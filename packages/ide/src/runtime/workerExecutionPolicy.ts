import { resolveTerminalInputMode } from '@/runtime/terminalProgramBridge';
import { NIBBLES_FILE_ID } from '@/store/filesSlice';
import type { TerminalInputModePreference } from '@/store/settingsSlice';
import type { WorkspaceTab } from '@/store/uiShellSlice';

export const DESKTOP_GAMEPLAY_FRAME_BUDGET_MS = 6;
export const MOBILE_GAMEPLAY_FRAME_BUDGET_MS = 4;
export const DESKTOP_GAMEPLAY_PULSE_FRAME_BUDGET_MS = 3;
export const MOBILE_GAMEPLAY_PULSE_FRAME_BUDGET_MS = 2;

export interface WorkerFrameBudgetPolicyOptions {
  activeFileId: string;
  workspaceTab: WorkspaceTab;
  terminalInputModePreference: TerminalInputModePreference;
  isCompactShell: boolean;
  environmentFrameBudgetMs?: number;
}

export function shouldUseTerminalFocusedWorkerProfile(
  options: Omit<WorkerFrameBudgetPolicyOptions, 'environmentFrameBudgetMs'>
): boolean {
  return options.activeFileId === NIBBLES_FILE_ID && options.workspaceTab === 'terminal';
}

export function resolveWorkerFrameBudgetMs(
  options: WorkerFrameBudgetPolicyOptions
): number | undefined {
  if (options.environmentFrameBudgetMs !== undefined) {
    return options.environmentFrameBudgetMs;
  }

  if (!shouldUseTerminalFocusedWorkerProfile(options)) {
    return undefined;
  }

  const terminalInputMode = resolveTerminalInputMode({
    activeFileId: options.activeFileId,
    isCompactShell: options.isCompactShell,
    preference: options.terminalInputModePreference,
  });

  return terminalInputMode === 'touch-only'
    ? MOBILE_GAMEPLAY_FRAME_BUDGET_MS
    : DESKTOP_GAMEPLAY_FRAME_BUDGET_MS;
}

export function resolveWorkerPulseFrameBudgetMs(
  options: Omit<WorkerFrameBudgetPolicyOptions, 'environmentFrameBudgetMs'>
): number | undefined {
  if (!shouldUseTerminalFocusedWorkerProfile(options)) {
    return undefined;
  }

  const terminalInputMode = resolveTerminalInputMode({
    activeFileId: options.activeFileId,
    isCompactShell: options.isCompactShell,
    preference: options.terminalInputModePreference,
  });

  return terminalInputMode === 'touch-only'
    ? MOBILE_GAMEPLAY_PULSE_FRAME_BUDGET_MS
    : DESKTOP_GAMEPLAY_PULSE_FRAME_BUDGET_MS;
}
