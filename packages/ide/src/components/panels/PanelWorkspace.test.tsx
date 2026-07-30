import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { createIdeStore, duplicatePanel, revealPanelKind, setColumnCount, type AppStore } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';
import PanelWorkspace from './PanelWorkspace';

describe('PanelWorkspace', () => {
  let store: AppStore;
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    store = createIdeStore();
  });

  it('renders the Classic preset with instance-scoped panel frames', () => {
    renderWithIdeProviders(<PanelWorkspace />, { store });
    expect(screen.getByTestId('panel-column-1')).toBeInTheDocument();
    expect(screen.getByTestId('panel-column-2')).toBeInTheDocument();
    expect(screen.getByTestId('panel-instance-panel-terminal-1')).toBeInTheDocument();
    expect(screen.getByTestId('panel-instance-panel-registers-2')).toBeInTheDocument();
    const targets = document.querySelectorAll('[data-panel-dock-target]');
    expect(targets).toHaveLength(4);
    expect(Array.from(targets).map((target) => target.getAttribute('data-panel-dock-relation'))).toEqual([
      'before', 'after', 'before', 'after',
    ]);
  });

  it('creates a passive terminal mirror and transfers ownership explicitly', () => {
    store.dispatch(duplicatePanel({ sourcePanelId: 'panel-terminal-1' }));
    renderWithIdeProviders(<PanelWorkspace />, { store });
    expect(screen.getByText('Mirror')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /make interactive/i }));
    expect(store.getState().panelLayout.activeLayout.terminalOwnerPanelId).not.toBe('panel-terminal-1');
    expect(screen.getAllByTestId('terminal-screen')).toHaveLength(1);
  });

  it('changes column count and minimizes panel bodies through accessible controls', () => {
    store.dispatch(setColumnCount(3));
    renderWithIdeProviders(<PanelWorkspace />, { store });
    expect(store.getState().panelLayout.activeLayout.columns).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /minimize screen/i }));
    expect(store.getState().panelLayout.activeLayout.instances['panel-terminal-1']?.minimized).toBe(true);
    expect(screen.queryByTestId('terminal-screen')).not.toBeInTheDocument();
  });

  it('floats, docks, duplicates, and closes panels through accessible header actions', () => {
    renderWithIdeProviders(<PanelWorkspace />, { store });
    fireEvent.click(screen.getByRole('button', { name: 'Float Screen' }));
    expect(store.getState().panelLayout.activeLayout.floatingPanelIds).toEqual(['panel-terminal-1']);
    expect(screen.getByTestId('panel-instance-panel-terminal-1')).toHaveClass('panel-frame-floating');

    fireEvent.click(screen.getByRole('button', { name: 'Dock Screen' }));
    expect(store.getState().panelLayout.activeLayout.floatingPanelIds).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Screen' }));
    expect(Object.values(store.getState().panelLayout.activeLayout.instances).filter((panel) => panel.kind === 'terminal')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Close Screen' })[1]!);
    expect(Object.values(store.getState().panelLayout.activeLayout.instances).filter((panel) => panel.kind === 'terminal')).toHaveLength(1);
  });

  it('renders without a separate workspace toolbar row', () => {
    renderWithIdeProviders(<PanelWorkspace />, { store });
    expect(screen.queryByLabelText('Workspace layout controls')).not.toBeInTheDocument();
    expect(document.querySelector('.panel-workspace-toolbar')).not.toBeInTheDocument();
  });

  it('integrates the hardware title and window controls into one header', () => {
    store.dispatch(revealPanelKind('hardware-display'));
    renderWithIdeProviders(<PanelWorkspace />, { store });

    const hardwareFrame = screen.getByTestId(/panel-instance-panel-hardware-display/);
    expect(hardwareFrame.querySelectorAll('.panel-frame-header')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Seven-segment display' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Display base address' })).toBeInTheDocument();

    const controls = screen.getByRole('toolbar', { name: 'Seven-segment display panel controls' });
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Minimize Seven-segment display' }));
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Close Seven-segment display' }));
  });
});
