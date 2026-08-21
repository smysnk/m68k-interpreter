import { executionCoordinator, type ExecutionCommand } from './executionCoordinator';

interface ShortcutDefinition {
  command: ExecutionCommand;
  key: string;
  shift?: boolean;
  alt?: boolean;
}

export const EXECUTION_SHORTCUTS: readonly ShortcutDefinition[] = [
  { command: 'run', key: 'F5' },
  { command: 'pause', key: 'F6' },
  { command: 'stop', key: 'F5', shift: true },
  { command: 'stepOver', key: 'F10' },
  { command: 'stepInto', key: 'F11' },
  { command: 'stepOut', key: 'F11', shift: true },
  { command: 'stepBack', key: 'F11', alt: true },
];

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export function handleExecutionShortcut(event: KeyboardEvent): boolean {
  if (isEditableTarget(event.target)) return false;
  const shortcut = EXECUTION_SHORTCUTS.find(
    (item) =>
      item.key === event.key &&
      Boolean(item.shift) === event.shiftKey &&
      Boolean(item.alt) === event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
  );
  if (!shortcut) return false;
  event.preventDefault();
  executionCoordinator.execute(shortcut.command);
  return true;
}

export function installExecutionKeyboardShortcuts(target: Window = window): () => void {
  target.addEventListener('keydown', handleExecutionShortcut);
  return () => target.removeEventListener('keydown', handleExecutionShortcut);
}
