import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { AppShell } from './App';
import FileExplorerSidebar from './FileExplorerSidebar';
import { nibblesSource } from '@/programs/nibbles';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { createIdeStore, ideStore, resetFilesState, resetSettingsState, setActiveFile } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { IDE_PERSISTENCE_KEY } from '@/store/persistence';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

function openAppMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
}

function openStyleMenu(): void {
  openAppMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: /style/i }));
}

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

describe('App', () => {
  beforeEach(() => {
    mockSystemTheme('light');
    setViewportWidth(1280);
    window.localStorage.clear();
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetFilesState());
    ideStore.dispatch(resetSettingsState());
    window.editorCode = '';
    window.emulatorInstance = null;
  });

  it('loads the selected sidebar file into the editor', async () => {
    const store = createIdeStore();

    renderWithIdeProviders(<FileExplorerSidebar />, { store });

    fireEvent.click(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(await screen.findByRole('button', { name: /scratch\.asm/i }));

    await waitFor(() => {
      expect(store.getState().uiShell.workspaceTab).toBe('code');
      expect(store.getState().emulator.editorCode).toContain('Write your M68K assembly code here');
    });

    fireEvent.click(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(await screen.findByRole('button', { name: /nibbles\.asm/i }));

    await waitFor(() => {
      expect(store.getState().emulator.editorCode).toBe(nibblesSource);
      expect(window.editorCode).toContain('END NIBBLES');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open file explorer/i })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });
  });

  it('defaults the workspace to the terminal tab and lets the user switch to code', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('assembly-editor')).toBeInTheDocument();
  });

  it('activates the compact mobile shell and exposes terminal, code, registers, and memory views', () => {
    setViewportWidth(600);

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-shell-mode', 'mobile');
    expect(screen.getByTestId('app-container')).toHaveAttribute('data-terminal-view-mode', 'focused');
    expect(screen.queryByTestId('resize-handle-root')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Interpreter engine')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open file explorer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Run program')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /registers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /memory/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /registers/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-terminal-view-mode', 'standard');
    expect(screen.getByText('Flags')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /memory/i }));

    expect(screen.getByLabelText('Start Address')).toBeInTheDocument();
  });

  it('keeps Nibbles selected in the persisted file state', () => {
    render(<App />);

    expect(ideStore.getState().files.activeFileId).toBe('example:nibbles.asm');
  });

  it('keeps the code workspace selected when opening Nibbles from the sidebar', () => {
    ideStore.dispatch(setActiveFile('workspace:scratch.asm'));

    render(<App />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /open file explorer/i }));
    fireEvent.click(screen.getByRole('button', { name: /nibbles\.asm/i }));

    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches the right pane between registers and memory tabs', () => {
    render(<App />);

    const registersTab = screen.getByRole('tab', { name: /registers/i });
    const memoryTab = screen.getByRole('tab', { name: /memory/i });

    expect(registersTab).toHaveAttribute('aria-selected', 'true');
    expect(memoryTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByText('Flags').length).toBeGreaterThan(0);

    fireEvent.click(memoryTab);

    expect(registersTab).toHaveAttribute('aria-selected', 'false');
    expect(memoryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Start Address')).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: /code/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Compatibility notes')).toBeVisible();
    expect(store.getState().files.activeFileId).toBe('example:nibbles.asm');
    expect(store.getState().emulator.editorCode).toBe(nibblesSource);
  });

  it('propagates the overall app theme into the terminal surface', () => {
    mockSystemTheme('dark');

    render(<App />);

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'dark');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'dark');
    expect(screen.getByRole('button', { name: /open app menu/i })).toBeInTheDocument();
    expect(screen.queryByText(/Engine:/)).not.toBeInTheDocument();
  });

  it('lets the app menu style selector switch the whole IDE theme', () => {
    mockSystemTheme('dark');

    render(<App />);

    openStyleMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k light/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('.terminal-container')).toHaveAttribute('data-terminal-theme', 'light');
    expect(document.querySelector('.retro-lcd')).toHaveAttribute('data-display-surface-mode', 'light');

    openStyleMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k dark/i }));

    expect(screen.getByTestId('app-container')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
