import type React from 'react';
import Editor from '@/components/Editor';
import HelpPanel from '@/components/HelpPanel';
import Memory from '@/components/Memory';
import Registers from '@/components/Registers';
import Terminal from '@/components/Terminal';
import DigitalIoPanel from '@/components/hardware/panels/DigitalIoPanel';
import InterruptRequestsPanel from '@/components/hardware/panels/InterruptRequestsPanel';
import SevenSegmentPanel from '@/components/hardware/panels/SevenSegmentPanel';
import {
  DigitalIoHeaderAccessory,
  SevenSegmentHeaderAccessory,
} from '@/components/hardware/panels/HardwarePanelHeaderAccessories';
import {
  PANEL_KIND_DEFINITIONS,
  PANEL_KINDS,
  type PanelInstance,
  type PanelKind,
} from '@/store/panelLayoutTypes';

export interface PanelBodyProps {
  instance: PanelInstance;
  interactive: boolean;
  requestInteraction: () => void;
}

export interface PanelHeaderAccessoryProps {
  instance: PanelInstance;
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
  HeaderAccessory?: React.ComponentType<PanelHeaderAccessoryProps>;
  render: (props: PanelBodyProps) => React.ReactNode;
}

function metadata(kind: PanelKind) {
  return PANEL_KIND_DEFINITIONS[kind];
}

export const PANEL_REGISTRY: Record<PanelKind, PanelRegistryEntry> = {
  terminal: {
    ...metadata('terminal'),
    render: ({ instance, interactive, requestInteraction }) => (
      <Terminal
        instanceId={instance.id}
        interactive={interactive}
        onRequestInteraction={requestInteraction}
      />
    ),
  },
  code: {
    ...metadata('code'),
    render: () => <Editor />,
  },
  registers: {
    ...metadata('registers'),
    render: ({ instance }) => <Registers instanceId={instance.id} />,
  },
  memory: {
    ...metadata('memory'),
    render: ({ instance }) => <Memory instanceId={instance.id} />,
  },
  'hardware-display': {
    ...metadata('hardware-display'),
    HeaderAccessory: SevenSegmentHeaderAccessory,
    render: ({ instance }) => <SevenSegmentPanel instance={instance} />,
  },
  'hardware-digital-io': {
    ...metadata('hardware-digital-io'),
    HeaderAccessory: DigitalIoHeaderAccessory,
    render: ({ instance }) => <DigitalIoPanel instance={instance} />,
  },
  'hardware-interrupts': {
    ...metadata('hardware-interrupts'),
    render: () => <InterruptRequestsPanel />,
  },
  help: {
    ...metadata('help'),
    render: () => <HelpPanel />,
  },
};

export const PANEL_KIND_ORDER: readonly PanelKind[] = [...PANEL_KINDS].sort(
  (left, right) =>
    PANEL_KIND_DEFINITIONS[left].addMenuOrder -
    PANEL_KIND_DEFINITIONS[right].addMenuOrder
);

export function getPanelDomIds(instanceId: string) {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    frameId: `panel-frame-${safeId}`,
    headerId: `panel-header-${safeId}`,
    bodyId: `panel-body-${safeId}`,
    testId: `panel-instance-${safeId}`,
  };
}
