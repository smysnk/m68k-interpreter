import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { createIdeStore, duplicatePanel, focusPanel, revealPanelKind, setColumnCount, type AppStore } from '@/store';
import { PANEL_KIND_ORDER, PANEL_REGISTRY } from '@/panels/panelRegistry';
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
    fireEvent.click(screen.getByRole('img', { name: 'M68K terminal mirror' }));
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

  it('keeps only minimize and close in each panel header', () => {
    renderWithIdeProviders(<PanelWorkspace />, { store });
    const controls = screen.getByRole('toolbar', { name: 'Screen panel controls' });

    expect(within(controls).getAllByRole('button')).toHaveLength(2);
    expect(within(controls).getByRole('button', { name: 'Minimize Screen' })).toBeInTheDocument();
    expect(within(controls).getByRole('button', { name: 'Close Screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate Screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Float Screen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('More actions for Screen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Drag Screen panel')).toHaveClass('panel-drag-activator-sr-only');
    expect(document.querySelector('.panel-drag-handle')).not.toBeInTheDocument();
  });

  it('renders without a separate workspace toolbar row', () => {
    renderWithIdeProviders(<PanelWorkspace />, { store });
    expect(screen.queryByLabelText('Workspace layout controls')).not.toBeInTheDocument();
    expect(document.querySelector('.panel-workspace-toolbar')).not.toBeInTheDocument();
  });

  it('does not render a second panel switcher in the compact workspace', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 600 });
    store.dispatch(focusPanel('panel-registers-2'));

    renderWithIdeProviders(<PanelWorkspace />, { store });

    expect(screen.queryByRole('tablist', { name: 'Open panels' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registers' })).toBeInTheDocument();
  });

  it('opens the shared panel catalogue from an empty column and adds the selection there', () => {
    store.dispatch(setColumnCount(3));
    renderWithIdeProviders(<PanelWorkspace />, { store });

    const addPanelButton = screen.getByRole('button', { name: 'Add panel to column 3' });
    fireEvent.click(addPanelButton);

    const menu = screen.getByRole('menu', { name: 'Add panel to column 3' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.getAttribute('aria-label'))
    ).toEqual(PANEL_KIND_ORDER.map((kind) => `Add ${PANEL_REGISTRY[kind].title} panel`));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Add panel to column 3' })).not.toBeInTheDocument();
    expect(addPanelButton).toHaveFocus();

    fireEvent.click(addPanelButton);
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'Add panel to column 3' })).getByRole('menuitem', {
        name: 'Add Memory panel',
      })
    );

    expect(
      within(screen.getByTestId('panel-column-3')).getByRole('toolbar', {
        name: 'Memory panel controls',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Add panel to column 3' })).not.toBeInTheDocument();
  });

  it('integrates the hardware title and window controls into one header', () => {
    store.dispatch(revealPanelKind('hardware-display'));
    store.dispatch(revealPanelKind('hardware-digital-io'));
    renderWithIdeProviders(<PanelWorkspace />, { store });

    const hardwareFrame = screen.getByTestId(/panel-instance-panel-hardware-display/);
    expect(hardwareFrame.querySelectorAll('.panel-frame-header')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Seven-segment display' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Display base address' })).toBeInTheDocument();
    expect(within(hardwareFrame).queryByText('Write output')).not.toBeInTheDocument();
    expect(within(hardwareFrame).queryByText('8 × byte')).not.toBeInTheDocument();
    expect(
      within(hardwareFrame).queryByText(
        'CPU byte writes at successive even addresses drive digits left to right.'
      )
    ).not.toBeInTheDocument();

    const controls = screen.getByRole('toolbar', { name: 'Seven-segment display panel controls' });
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Minimize Seven-segment display' }));
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Close Seven-segment display' }));

    const digitalFrame = screen.getByTestId(/panel-instance-panel-hardware-digital-io/);
    const digitalHeader = digitalFrame.querySelector('.panel-frame-header');
    const digitalBody = digitalFrame.querySelector('.panel-body');
    expect(digitalHeader).not.toBeNull();
    expect(digitalBody).not.toBeNull();
    expect(within(digitalHeader as HTMLElement).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(digitalBody as HTMLElement).getByRole('button', { name: 'Configure switch address' })).toBeInTheDocument();
    expect(within(digitalBody as HTMLElement).getByRole('button', { name: 'Request interrupt level 7' })).toBeInTheDocument();
    expect(screen.queryByTestId(/panel-instance-panel-hardware-interrupts/)).not.toBeInTheDocument();
  });
});
