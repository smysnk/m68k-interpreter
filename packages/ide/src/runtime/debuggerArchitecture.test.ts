import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ideSourceRoot = join(import.meta.dirname, '..');

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('debugger architecture boundaries', () => {
  it('keeps the active file as the only production source authority', () => {
    const offenders = typescriptFiles(ideSourceRoot).filter((path) =>
      /window\.editorCode/.test(readFileSync(path, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('prevents execution and debugger orchestration from mutating panel layout', () => {
    const orchestrationFiles = [
      join(ideSourceRoot, 'hooks/useEmulatorEvents.ts'),
      ...typescriptFiles(join(ideSourceRoot, 'runtime')),
    ];
    const forbidden =
      /\b(?:revealPanelKind|focusPanel|createPanel|applyPanelPreset|movePanel|dockPanel|floatPanel)\b/;
    const offenders = orchestrationFiles.filter((path) =>
      forbidden.test(readFileSync(path, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('routes hook commands through focused domain ports rather than the monolithic port', () => {
    const hook = readFileSync(join(ideSourceRoot, 'hooks/useEmulatorEvents.ts'), 'utf8');
    expect(hook).not.toMatch(/runtimeCommandPort\./);
    expect(hook).toContain('runtimeExecutionCommandPort');
    expect(hook).toContain('runtimeDebuggerCommandPort');
    expect(hook).toContain('runtimeLifecycleCommandPort');
    expect(hook).toContain('runtimeDeviceCommandPort');
  });
});
