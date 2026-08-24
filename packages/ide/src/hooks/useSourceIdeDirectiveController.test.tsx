import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSourceIdeDirectiveController } from './useSourceIdeDirectiveController';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';
import { createIdeStore, requestSourceIdeIgnore, setActiveFile, setEditorCode } from '@/store';
import { IDE_PERSISTENCE_KEY } from '@/store/persistence';

function Harness(): null {
  useSourceIdeDirectiveController();
  return null;
}

describe('source IDE directive controller', () => {
  beforeEach(() => window.localStorage.clear());

  it('applies source configuration and restores the session baseline for scratch', async () => {
    const store = createIdeStore();
    store.dispatch(setActiveFile('example:nibbles.asm'));
    renderWithIdeProviders(<Harness />, { store });

    await waitFor(() => expect(store.getState().sourceIde.current.status).toBe('applied'));
    expect(store.getState().panelLayout.activeLayout.name).toContain('Terminal Focus');
    expect(
      store.getState().panelLayout.activeLayout.instances[
        store.getState().panelLayout.activeLayout.focusedPanelId!
      ]?.kind
    ).toBe('terminal');
    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem(IDE_PERSISTENCE_KEY) ?? '{}');
      expect(persisted.panelLayout.activeLayout.name).toBe('Classic IDE');
    });

    act(() => store.dispatch(setActiveFile('example:memory-copy.asm')));
    await waitFor(() =>
      expect(store.getState().sourceIde.current).toMatchObject({
        status: 'applied',
        fileId: 'example:memory-copy.asm',
      })
    );
    const memoryPanel = Object.values(store.getState().panelLayout.activeLayout.instances).find(
      (panel) => panel.kind === 'memory'
    );
    expect(memoryPanel?.config).toEqual({ kind: 'memory', startAddress: 0x1000 });

    act(() => store.dispatch(setActiveFile('workspace:scratch.asm')));
    await waitFor(() => expect(store.getState().sourceIde.current.status).toBe('none'));
    expect(store.getState().panelLayout.activeLayout.name).toBe('Classic IDE');
    expect(store.getState().settings).toMatchObject({
      cpuModel: 'm68000',
      machineProfile: 'easy68k',
    });
  });

  it('restores the baseline when a file configuration is ignored', async () => {
    const store = createIdeStore();
    store.dispatch(setActiveFile('example:nibbles.asm'));
    renderWithIdeProviders(<Harness />, { store });
    await waitFor(() => expect(store.getState().sourceIde.current.status).toBe('applied'));

    act(() => store.dispatch(requestSourceIdeIgnore('example:nibbles.asm')));
    await waitFor(() => expect(store.getState().sourceIde.current.status).toBe('ignored'));
    expect(store.getState().panelLayout.activeLayout.name).toBe('Classic IDE');
  });

  it('reports an invalid directive without replacing the baseline layout', async () => {
    const store = createIdeStore();
    store.dispatch(setActiveFile('workspace:scratch.asm'));
    store.dispatch(setEditorCode('; @m68k-ide/v1 layout=unknown\nORG $1000'));
    renderWithIdeProviders(<Harness />, { store });

    await waitFor(() => expect(store.getState().sourceIde.current.status).toBe('invalid'));
    expect(store.getState().panelLayout.activeLayout.name).toBe('Classic IDE');
  });
});
