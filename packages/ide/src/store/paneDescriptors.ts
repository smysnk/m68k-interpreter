import type { InspectorView, WorkspaceTab } from '@/store/uiShellSlice';

export interface WorkspacePaneDescriptor {
  id: WorkspaceTab;
  label: string;
  compactLabel: string;
  desktopWorkspace: boolean;
  compactWorkspace: boolean;
}

export interface InspectorPaneDescriptor {
  id: InspectorView;
  label: string;
}

export const WORKSPACE_PANE_DESCRIPTORS: readonly WorkspacePaneDescriptor[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    compactLabel: 'Term',
    desktopWorkspace: true,
    compactWorkspace: true,
  },
  {
    id: 'code',
    label: 'Code',
    compactLabel: 'Code',
    desktopWorkspace: true,
    compactWorkspace: true,
  },
  {
    id: 'registers',
    label: 'Registers',
    compactLabel: 'Regs',
    desktopWorkspace: false,
    compactWorkspace: true,
  },
  {
    id: 'memory',
    label: 'Memory',
    compactLabel: 'Mem',
    desktopWorkspace: false,
    compactWorkspace: true,
  },
  {
    id: 'hardware',
    label: 'Hardware',
    compactLabel: 'HW',
    desktopWorkspace: false,
    compactWorkspace: true,
  },
] as const;

export const INSPECTOR_PANE_DESCRIPTORS: readonly InspectorPaneDescriptor[] = [
  { id: 'registers', label: 'Registers' },
  { id: 'memory', label: 'Memory' },
  { id: 'hardware', label: 'Hardware' },
] as const;

export function getWorkspacePaneDescriptors(compact: boolean): readonly WorkspacePaneDescriptor[] {
  return WORKSPACE_PANE_DESCRIPTORS.filter((pane) =>
    compact ? pane.compactWorkspace : pane.desktopWorkspace
  );
}
