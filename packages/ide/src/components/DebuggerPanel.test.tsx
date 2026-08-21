import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DebuggerPanel from './DebuggerPanel';
import { createIdeStore, resetToPreset, syncDebugSnapshot, type PanelInstance } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

const instance: PanelInstance = {
  id: 'panel-debugger-test',
  kind: 'debugger',
  title: 'Debugger',
  minimized: false,
  config: { kind: 'debugger', collapsedSections: [], radix: 'hex' },
};

describe('DebuggerPanel', () => {
  it('shows one shared structured stop and manages address breakpoints', () => {
    const store = createIdeStore();
    store.dispatch(
      syncDebugSnapshot({
        status: 'paused',
        stop: {
          reason: 'breakpoint',
          pc: 0x101a,
          source: { fileId: 'main.asm', line: 14 },
        },
        breakpoints: [],
        watchpoints: [],
        watches: [],
        callStack: [],
        logs: [],
      })
    );
    renderWithIdeProviders(<DebuggerPanel instance={instance} />, { store });
    expect(screen.getAllByText('breakpoint')).toHaveLength(2);
    expect(screen.getAllByText('$0000101A')).toHaveLength(2);
    const addressInput = screen.getByLabelText('Breakpoint address');
    fireEvent.change(addressInput, { target: { value: '$1020' } });
    fireEvent.submit(addressInput.closest('form')!);
    expect(store.getState().debugger.configuration.breakpoints[0]).toMatchObject({
      kind: 'address',
      address: 0x1020,
      enabled: true,
    });
  });

  it('persists collapse state per panel instance', () => {
    const store = createIdeStore();
    store.dispatch(resetToPreset('debug'));
    const persistedInstance = Object.values(
      store.getState().panelLayout.activeLayout.instances
    ).find((item) => item.kind === 'debugger');
    expect(persistedInstance).toBeDefined();
    renderWithIdeProviders(<DebuggerPanel instance={persistedInstance!} />, { store });
    fireEvent.click(document.querySelector('[data-debug-section="breakpoints"] button')!);
    expect(
      store.getState().panelLayout.activeLayout.instances[persistedInstance!.id]?.config
    ).toMatchObject({ kind: 'debugger', collapsedSections: ['breakpoints'] });
  });
});
