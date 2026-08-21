import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { AppShell } from './App';
import FileExplorerSidebar from './FileExplorerSidebar';
import { nibblesSource } from '@/programs/nibbles';
import { useEmulatorStore } from '@/stores/emulatorStore';
import {
  createIdeStore,
  ideStore,
  resetFilesState,
  resetSourceIdeState,
  resetSettingsState,
  resetToPreset,
  setActiveFile,
} from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { IDE_PERSISTENCE_KEY } from '@/store/persistence';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

function mockSystemTheme(theme: 'light' | 'dark'): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? theme === 'dark' : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  window.dispatchEvent(new Event('resize'));
}

function openViewMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^view$/i }));
}

describe('App', () => {
  beforeEach(() => {
    mockSystemTheme('light');
    setViewportWidth(1280);
    window.localStorage.clear();
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetFilesState());
    ideStore.dispatch(resetSourceIdeState());
    ideStore.dispatch(resetSettingsState());
    ideStore.dispatch(resetToPreset('classic'));
    window.emulatorInstance = null;
  });

  it('loads the selected sidebar file into the editor', async () => {
    const store = createIdeStore();
    const closeSidebar = vi.fn();

    renderWithIdeProviders(<FileExplorerSidebar open onClose={closeSidebar} />, { store });

    expect(screen.queryByText('workspace/scratch.asm')).not.toBeInTheDocument();
    expect(screen.queryByText('fixtures/nibbles.asm')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /scratch\.asm/i }));

    await waitFor(() => {
      const layout = store.getState().panelLayout.activeLayout;
      expect(layout.instances[layout.focusedPanelId ?? '']?.kind).toBe('code');
      expect(store.getState().emulator.editorCode).toContain('Write your M68K assembly code here');
    });

    fireEvent.click(await screen.findByRole('button', { name: /nibbles\.asm/i }));

    await waitFor(() => {
      expect(store.getState().emulator.editorCode).toBe(nibblesSource);
      const state = store.getState();
      expect(state.files.items.find((item) => item.id === state.files.activeFileId)?.content)
        .toContain('END NIBBLES');
    });

    expect(closeSidebar).toHaveBeenCalledTimes(2);
  });

  it('opens the file explorer from the navbar brand and dismisses it from outside', () => {
    render(<App />);

    const trigger = screen.getByRole('button', { name: /open file explorer/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('File explorer')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: /close file explorer/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByLabelText('File explorer')).toHaveAttribute('aria-hidden', 'false');

    fireEvent.pointerDown(screen.getByTestId('desktop-workspace-shell'));

    expect(screen.getByRole('button', { name: /open file explorer/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('omits the compact workspace switcher from the desktop navbar', () => {
    render(<App />);

    expect(screen.queryByRole('tablist', { name: 'Workspace views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /terminal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /code/i })).not.toBeInTheDocument();
  });

  it('activates the compact mobile projection with one tab row and makes every panel kind available', () => {
    setViewportWidth(600);

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-shell-mode', 'mobile');
    expect(screen.getByTestId('app-container')).toHaveAttribute(
      'data-terminal-view-mode',
      'focused'
    );
    expect(screen.queryByTestId('resize-handle-root')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Interpreter engine')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open file explorer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Run program')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /registers/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /registers/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute(
      'data-terminal-view-mode',
      'standard'
    );
    expect(screen.queryByRole('tablist', { name: 'Open panels' })).not.toBeInTheDocument();
    expect(screen.getByText('Flags')).toBeInTheDocument();
    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^add panel$/i }));
    expect(screen.getByRole('menuitem', { name: /add memory panel/i })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /add seven-segment display panel/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /add memory panel/i }));

    expect(screen.getByLabelText('Start Address')).toBeInTheDocument();

    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^add panel$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add seven-segment display panel/i }));

    expect(screen.getByTestId(/hardware-display-device-/)).toBeInTheDocument();
  });

  it('keeps Nibbles selected in the persisted file state', () => {
    render(<App />);

    expect(ideStore.getState().files.activeFileId).toBe('example:nibbles.asm');
  });

  it('applies the source-requested terminal focus when opening Nibbles', async () => {
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));

    await waitFor(() => {
      const layout = ideStore.getState().panelLayout.activeLayout;
      expect(layout.instances[layout.focusedPanelId ?? '']?.kind).toBe('terminal');
    });
    expect(screen.queryByText(/source config/i)).not.toBeInTheDocument();
  });

  it('adds registers, memory, and hardware as independent panel instances', () => {
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));
    render(<App />);
    expect(screen.getAllByText('Flags').length).toBeGreaterThan(0);
    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^add panel$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add memory panel/i }));
    expect(screen.getByLabelText('Start Address')).toBeInTheDocument();
    openViewMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^add panel$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add seven-segment display panel/i }));
    expect(screen.getByTestId(/hardware-display-device-/)).toBeInTheDocument();
  });

  it('hydrates theme and shell preferences from persisted storage', () => {
    window.localStorage.setItem(
      IDE_PERSISTENCE_KEY,
      JSON.stringify({
        settings: {
          editorTheme: EditorThemeEnum.M68K_DARK,
          followSystemTheme: false,
          lineNumbers: true,
        },
        uiShell: {
          workspaceTab: 'code',
          inspectorView: 'memory',
          contextView: 'help',
          contextOpen: true,
          layout: {
            rootHorizontal: [59, 41],
            rootHorizontalWithContext: [47, 33, 20],
            inspectorVertical: [52, 48],
          },
        },
        files: {
          activeFileId: 'workspace:scratch.asm',
          items: [
            {
              id: 'workspace:scratch.asm',
              name: 'scratch.asm',
              path: 'workspace/scratch.asm',
              kind: 'workspace',
              content: 'MOVE.L #7,D0',
            },
            {
              id: 'example:nibbles.asm',
              name: 'nibbles.asm',
              path: 'fixtures/nibbles.asm',
              kind: 'example',
              content: nibblesSource,
            },
          ],
        },
      })
    );

    const store = createIdeStore();
    renderWithIdeProviders(<AppShell />, { store });

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(store.getState().panelLayout.activeLayout.columns).toHaveLength(1);
    expect(store.getState().sourceIde.baseline?.panelLayout.activeLayout.columns).toHaveLength(3);
    expect(
      Object.values(store.getState().panelLayout.activeLayout.instances).map((panel) => panel.kind)
    ).toEqual(['terminal']);
    expect(store.getState().files.activeFileId).toBe('example:nibbles.asm');
    expect(store.getState().emulator.editorCode).toBe(nibblesSource);
  });

  it('propagates the overall app theme into the terminal surface', () => {
    mockSystemTheme('dark');

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('.terminal-container')).toHaveAttribute(
      'data-terminal-theme',
      'dark'
    );
    expect(document.querySelector('.retro-screen')).toHaveAttribute(
      'data-display-surface-mode',
      'dark'
    );
    expect(screen.getByRole('button', { name: /open app menu/i })).toBeInTheDocument();
    expect(screen.queryByText(/Engine:/)).not.toBeInTheDocument();
  });

  it('lets the navbar theme toggle switch the whole IDE theme', () => {
    mockSystemTheme('dark');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('.terminal-container')).toHaveAttribute(
      'data-terminal-theme',
      'light'
    );
    expect(document.querySelector('.retro-screen')).toHaveAttribute(
      'data-display-surface-mode',
      'light'
    );

    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
