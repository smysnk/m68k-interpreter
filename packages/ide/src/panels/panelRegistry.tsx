import type React from 'react';
import Editor from '@/components/Editor';
import HardwarePanel from '@/components/HardwarePanel';
import HelpPanel from '@/components/HelpPanel';
import Memory from '@/components/Memory';
import Registers from '@/components/Registers';
import Terminal from '@/components/Terminal';
import type { PanelInstance, PanelKind } from '@/store/panelLayoutTypes';

export interface PanelBodyProps {
  instance: PanelInstance;
  interactive: boolean;
  requestInteraction: () => void;
}

export interface PanelRegistryEntry {
  kind: PanelKind;
  title: string;
  icon: string;
  integratedHeader?: {
    eyebrow: string;
    title: string;
    caption: string;
  };
  canDuplicate: boolean;
  canFloat: boolean;
  minimumWidth: number;
  minimumFloatingSize: { width: number; height: number };
  render: (props: PanelBodyProps) => React.ReactNode;
}

export const PANEL_REGISTRY: Record<PanelKind, PanelRegistryEntry> = {
  terminal: {
    kind: 'terminal', title: 'Screen', icon: '▣', canDuplicate: true, canFloat: true,
    minimumWidth: 360, minimumFloatingSize: { width: 440, height: 340 },
    render: ({ instance, interactive, requestInteraction }) => (
      <Terminal instanceId={instance.id} interactive={interactive} onRequestInteraction={requestInteraction} />
    ),
  },
  code: {
    kind: 'code', title: 'Code', icon: '⌨', canDuplicate: true, canFloat: true,
    minimumWidth: 320, minimumFloatingSize: { width: 420, height: 320 }, render: () => <Editor />,
  },
  registers: {
    kind: 'registers', title: 'Registers', icon: 'R', canDuplicate: true, canFloat: true,
    minimumWidth: 280, minimumFloatingSize: { width: 380, height: 300 }, render: ({ instance }) => <Registers instanceId={instance.id} />,
  },
  memory: {
    kind: 'memory', title: 'Memory', icon: 'M', canDuplicate: true, canFloat: true,
    minimumWidth: 320, minimumFloatingSize: { width: 520, height: 340 }, render: ({ instance }) => <Memory instanceId={instance.id} />,
  },
  hardware: {
    kind: 'hardware', title: 'Hardware I/O', icon: 'I/O', canDuplicate: true, canFloat: true,
    integratedHeader: {
      eyebrow: 'Hardware',
      title: 'I/O Board',
      caption: 'Live memory-mapped controls for the running simulator.',
    },
    minimumWidth: 360, minimumFloatingSize: { width: 520, height: 420 }, render: () => <HardwarePanel embedded />,
  },
  help: {
    kind: 'help', title: 'Help', icon: '?', canDuplicate: true, canFloat: true,
    minimumWidth: 280, minimumFloatingSize: { width: 380, height: 300 }, render: () => <HelpPanel />,
  },
};

export const PANEL_KIND_ORDER: readonly PanelKind[] = ['terminal', 'code', 'registers', 'memory', 'hardware', 'help'];

export function getPanelDomIds(instanceId: string) {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    frameId: `panel-frame-${safeId}`,
    headerId: `panel-header-${safeId}`,
    bodyId: `panel-body-${safeId}`,
    testId: `panel-instance-${safeId}`,
  };
}
