import { describe, expect, it } from 'vitest';
import { createPanelPreset } from '@/panels/panelPresets';
import { bundledExampleFiles } from '@/programs/examples';
import { assembleProgramSource, loadProgramSource } from '@m68k/interpreter';
import {
  parseSourceIdeDirective,
  resolveSourceIdeLayout,
  sourceIdeHardwareDevices,
} from './sourceIdeDirective';

describe('compact source IDE directives', () => {
  it('parses a strict compact header from the first nonblank line', () => {
    const result = parseSourceIdeDirective(
      `\uFEFF\n; @m68k-ide/v1 layout=debug machine=easy68k cpu=m68000 focus=memory speed=0.5 run=manual memory=$1000\nORG $1000`
    );
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.directive).toEqual({
      version: 1,
      layout: 'debug',
      machine: 'easy68k',
      cpu: 'm68000',
      focus: 'memory',
      speed: 0.5,
      run: 'manual',
      memory: 0x1000,
    });
  });

  it('supports Easy68K star comments and explicit multimedia options', () => {
    const result = parseSourceIdeDirective(
      '* @m68k-ide/v1 layout=multimedia focus=graphics graphics-scale=integer graphics-smoothing=false'
    );
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.directive.graphicsScale).toBe('integer');
    expect(result.directive.graphicsSmoothing).toBe(false);
  });

  it('applies the dedicated Nibbles workbench with terminal focus', () => {
    const source = bundledExampleFiles.find((example) => example.name === 'nibbles.asm')!.content;
    const parsed = parseSourceIdeDirective(source);
    expect(parsed.status).toBe('valid');
    if (parsed.status !== 'valid') return;

    expect(parsed.directive).toMatchObject({
      layout: 'nibbles',
      machine: 'easy68k',
      cpu: 'm68000',
      focus: 'terminal',
      speed: 1,
      run: 'auto',
    });
    const resolved = resolveSourceIdeLayout(parsed.directive, createPanelPreset('classic'));
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.layout.name).toBe('Nibbles Workbench');
    expect(resolved.layout.columns.map((column) => column.width)).toEqual([41, 59]);
    expect(
      resolved.layout.columns.map((column) =>
        column.panelIds.map((id) => resolved.layout.instances[id]?.kind)
      )
    ).toEqual([['code', 'registers'], ['terminal']]);
    expect(resolved.layout.columns[0]?.panelSizes).toEqual({
      'panel-code-1': 64,
      'panel-registers-2': 36,
    });
    expect(resolved.layout.instances[resolved.layout.focusedPanelId!]?.kind).toBe('terminal');
    expect(resolved.layout.terminalOwnerPanelId).toBe(resolved.layout.focusedPanelId);
  });

  it('ignores ordinary comments and directives below source code', () => {
    expect(parseSourceIdeDirective('; ordinary comment\nORG $1000')).toEqual({ status: 'none' });
    expect(parseSourceIdeDirective('ORG $1000\n; @m68k-ide/v1 layout=debug')).toEqual({
      status: 'none',
    });
  });

  it.each([
    '; @m68k-ide/v2 layout=debug',
    '; @m68k-ide/v1 layout=unknown',
    '; @m68k-ide/v1 speed=99',
    '; @m68k-ide/v1 layout=debug layout=classic',
    '; @m68k-ide/v1 mystery=value',
    '; @m68k-ide/v1 display=$E00001',
    '; @m68k-ide/v1 digital-io=$E00010,$E00010',
  ])('reports invalid configuration without treating it as source code: %s', (source) => {
    const result = parseSourceIdeDirective(source);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('expands compact multi-device bases into validated hardware devices', () => {
    const result = parseSourceIdeDirective(
      '; @m68k-ide/v1 layout=hardware-lab display=$E00000,$E00020 digital-io=$E00040,$E00050'
    );
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(sourceIdeHardwareDevices(result.directive)).toEqual([
      { id: 'source-display-1', deviceType: 'display', displayBase: 0xe00000 },
      { id: 'source-display-2', deviceType: 'display', displayBase: 0xe00020 },
      {
        id: 'source-digital-io-1',
        deviceType: 'digital-io',
        ledAddress: 0xe00040,
        switchAddress: 0xe00040,
        buttonAddress: 0xe00042,
      },
      {
        id: 'source-digital-io-2',
        deviceType: 'digital-io',
        ledAddress: 0xe00050,
        switchAddress: 0xe00050,
        buttonAddress: 0xe00052,
      },
    ]);
  });

  it('resolves focus, memory, graphics, and multiple hardware panels', () => {
    const parsed = parseSourceIdeDirective(
      '; @m68k-ide/v1 layout=hardware-lab focus=hardware-digital-io display=$E00000,$E00020 digital-io=$E00040,$E00050'
    );
    expect(parsed.status).toBe('valid');
    if (parsed.status !== 'valid') return;
    const resolved = resolveSourceIdeLayout(parsed.directive, createPanelPreset('classic'));
    expect(resolved.diagnostics).toEqual([]);
    expect(
      Object.values(resolved.layout.instances).filter((panel) => panel.kind === 'hardware-display')
    ).toHaveLength(2);
    expect(
      Object.values(resolved.layout.instances).filter(
        (panel) => panel.kind === 'hardware-digital-io'
      )
    ).toHaveLength(2);
    expect(resolved.layout.instances[resolved.layout.focusedPanelId!]?.kind).toBe(
      'hardware-digital-io'
    );
  });

  it('focuses the dedicated IRQ panel for the interrupt example', () => {
    const source = bundledExampleFiles.find(
      (example) => example.name === 'hardware-interrupts.asm'
    )!.content;
    const parsed = parseSourceIdeDirective(source);
    expect(parsed.status).toBe('valid');
    if (parsed.status !== 'valid') return;

    const resolved = resolveSourceIdeLayout(parsed.directive, createPanelPreset('classic'));
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.layout.instances[resolved.layout.focusedPanelId!]?.kind).toBe(
      'hardware-interrupts'
    );
  });

  it('keeps configured bundled examples on exactly one valid compact directive', () => {
    for (const example of bundledExampleFiles) {
      const directiveLines = example.content
        .split(/\r?\n/)
        .filter((line) => line.includes('@m68k-ide/'));
      if (example.id === 'example:hello-world.asm') {
        expect(directiveLines, example.name).toHaveLength(0);
        expect(parseSourceIdeDirective(example.content), example.name).toEqual({ status: 'none' });
        continue;
      }
      expect(directiveLines, example.name).toHaveLength(1);
      expect(parseSourceIdeDirective(example.content), example.name).toMatchObject({
        status: 'valid',
      });

      const loaded = loadProgramSource(example.content);
      expect(loaded.exception, example.name).toBeUndefined();
      expect(loaded.errors, example.name).toEqual([]);
    }
  });

  it('remains an assembler-neutral comment', () => {
    const assembly = assembleProgramSource(`; @m68k-ide/v1 layout=debug run=manual
ORG $1000
START MOVEQ #1,D0
END START`);
    expect(assembly.diagnostics).toEqual([]);
    expect(assembly.image?.entryPoint).toBe(0x1000);
  });
});
