import {
  isCpuModel,
  isMachineProfile,
  validateEasy68kHardwareDevices,
  type CpuModel,
  type Easy68kHardwareDeviceConfig,
  type MachineProfile,
} from '@m68k/interpreter';
import { createPanelPreset } from '@/panels/panelPresets';
import {
  PANEL_KINDS,
  createDigitalIoBitLabels,
  getPanelDefaultTitle,
  type PanelKind,
  type PanelLayoutDocument,
  type PanelPresetId,
} from '@/store/panelLayoutTypes';

const DIRECTIVE_PREFIX = '@m68k-ide/';
const DIRECTIVE_VERSION = 'v1';
const MAX_DIRECTIVE_LENGTH = 1024;
const MAX_ADDRESS = 0x00ff_ffff;
const PANEL_PRESET_IDS: readonly PanelPresetId[] = [
  'classic',
  'code-run',
  'nibbles',
  'hardware-lab',
  'multimedia',
  'debug',
  'terminal-focus',
];

export type SourceIdeRunMode = 'auto' | 'manual';
export type SourceIdeGraphicsScale = 'fit' | 'one-to-one' | 'integer';

export interface SourceIdeDirective {
  version: 1;
  layout?: PanelPresetId;
  machine?: MachineProfile;
  cpu?: CpuModel;
  focus?: PanelKind;
  speed?: number;
  run?: SourceIdeRunMode;
  memory?: number;
  display?: number[];
  digitalIo?: number[];
  graphicsScale?: SourceIdeGraphicsScale;
  graphicsSmoothing?: boolean;
}

export type SourceIdeDirectiveResult =
  | { status: 'none' }
  | { status: 'invalid'; raw: string; diagnostics: string[] }
  | {
      status: 'valid';
      raw: string;
      signature: string;
      directive: SourceIdeDirective;
      diagnostics: [];
    };

const knownKeys = new Set([
  'layout',
  'machine',
  'cpu',
  'focus',
  'speed',
  'run',
  'memory',
  'display',
  'digital-io',
  'graphics-scale',
  'graphics-smoothing',
]);

function parseAddress(value: string): number | null {
  const normalized = value.trim();
  const radix = normalized.startsWith('$') || /^0x/i.test(normalized) ? 16 : 10;
  const digits = normalized.startsWith('$')
    ? normalized.slice(1)
    : /^0x/i.test(normalized)
      ? normalized.slice(2)
      : normalized;
  if (!digits || !(radix === 16 ? /^[0-9a-f]+$/i : /^\d+$/.test(digits))) return null;
  const address = Number.parseInt(digits, radix);
  return Number.isSafeInteger(address) && address >= 0 && address <= MAX_ADDRESS ? address : null;
}

function parseAddressList(value: string): number[] | null {
  const entries = value.split(',');
  if (!entries.length || entries.some((entry) => !entry.trim())) return null;
  const addresses = entries.map(parseAddress);
  if (addresses.some((address) => address === null)) return null;
  const unique = [...new Set(addresses as number[])];
  return unique.length === addresses.length ? unique : null;
}

function invalid(raw: string, diagnostics: string[]): SourceIdeDirectiveResult {
  return { status: 'invalid', raw, diagnostics };
}

export function parseSourceIdeDirective(source: string): SourceIdeDirectiveResult {
  const firstNonblank = source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!firstNonblank) return { status: 'none' };
  const comment = firstNonblank.match(/^\s*;\s*(.*)$/) ?? firstNonblank.match(/^\*\s*(.*)$/);
  if (!comment?.[1]?.startsWith(DIRECTIVE_PREFIX)) return { status: 'none' };
  const raw = firstNonblank.trim();
  if (raw.length > MAX_DIRECTIVE_LENGTH)
    return invalid(raw, [`Directive exceeds ${MAX_DIRECTIVE_LENGTH} characters.`]);

  const body = comment[1];
  const versionMatch = body.match(/^@m68k-ide\/(v[^\s]+)(?:\s+(.*))?$/);
  if (!versionMatch) return invalid(raw, ['Malformed @m68k-ide directive.']);
  if (versionMatch[1] !== DIRECTIVE_VERSION)
    return invalid(raw, [`Unsupported source IDE directive version "${versionMatch[1]}".`]);

  const tokens = versionMatch[2]?.trim() ? versionMatch[2].trim().split(/\s+/) : [];
  const values = new Map<string, string>();
  const diagnostics: string[] = [];
  for (const token of tokens) {
    const separator = token.indexOf('=');
    if (
      separator <= 0 ||
      separator === token.length - 1 ||
      token.indexOf('=', separator + 1) >= 0
    ) {
      diagnostics.push(`Malformed token "${token}"; expected key=value.`);
      continue;
    }
    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1);
    if (!knownKeys.has(key)) diagnostics.push(`Unknown source IDE key "${key}".`);
    else if (values.has(key)) diagnostics.push(`Duplicate source IDE key "${key}".`);
    else values.set(key, value);
  }
  if (diagnostics.length) return invalid(raw, diagnostics);

  const directive: SourceIdeDirective = { version: 1 };
  const layout = values.get('layout');
  if (layout) {
    if (!PANEL_PRESET_IDS.includes(layout as PanelPresetId))
      diagnostics.push(`Unsupported layout "${layout}".`);
    else directive.layout = layout as PanelPresetId;
  }
  const machine = values.get('machine');
  if (machine) {
    if (!isMachineProfile(machine)) diagnostics.push(`Unsupported machine "${machine}".`);
    else directive.machine = machine;
  }
  const cpu = values.get('cpu');
  if (cpu) {
    if (!isCpuModel(cpu)) diagnostics.push(`Unsupported CPU "${cpu}".`);
    else directive.cpu = cpu;
  }
  const focus = values.get('focus');
  if (focus) {
    if (!PANEL_KINDS.includes(focus as PanelKind))
      diagnostics.push(`Unsupported focus panel "${focus}".`);
    else directive.focus = focus as PanelKind;
  }
  const speed = values.get('speed');
  if (speed) {
    const parsed = Number(speed);
    if (!Number.isFinite(parsed) || parsed < 0.25 || parsed > 8)
      diagnostics.push('Speed must be a number from 0.25 through 8.');
    else directive.speed = parsed;
  }
  const run = values.get('run');
  if (run) {
    if (run !== 'auto' && run !== 'manual') diagnostics.push('Run must be "auto" or "manual".');
    else directive.run = run;
  }
  const memory = values.get('memory');
  if (memory) {
    const address = parseAddress(memory);
    if (address === null) diagnostics.push(`Invalid memory address "${memory}".`);
    else directive.memory = address;
  }
  for (const [key, property] of [
    ['display', 'display'],
    ['digital-io', 'digitalIo'],
  ] as const) {
    const value = values.get(key);
    if (!value) continue;
    const addresses = parseAddressList(value);
    if (!addresses) diagnostics.push(`Invalid ${key} address list "${value}".`);
    else directive[property] = addresses;
  }
  const graphicsScale = values.get('graphics-scale');
  if (graphicsScale) {
    if (!['fit', 'one-to-one', 'integer'].includes(graphicsScale))
      diagnostics.push(`Unsupported graphics scale "${graphicsScale}".`);
    else directive.graphicsScale = graphicsScale as SourceIdeGraphicsScale;
  }
  const smoothing = values.get('graphics-smoothing');
  if (smoothing) {
    if (smoothing !== 'true' && smoothing !== 'false')
      diagnostics.push('Graphics smoothing must be "true" or "false".');
    else directive.graphicsSmoothing = smoothing === 'true';
  }

  const hardwareDevices = sourceIdeHardwareDevices(directive);
  if (hardwareDevices.length) {
    const validation = validateEasy68kHardwareDevices(hardwareDevices);
    diagnostics.push(...validation.errors);
  }
  if (diagnostics.length) return invalid(raw, diagnostics);
  return {
    status: 'valid',
    raw,
    signature: JSON.stringify(directive),
    directive,
    diagnostics: [],
  };
}

export function sourceIdeHardwareDevices(
  directive: SourceIdeDirective
): Easy68kHardwareDeviceConfig[] {
  return [
    ...(directive.display ?? []).map((displayBase, index) => ({
      id: `source-display-${index + 1}`,
      deviceType: 'display' as const,
      displayBase,
    })),
    ...(directive.digitalIo ?? []).map((base, index) => ({
      id: `source-digital-io-${index + 1}`,
      deviceType: 'digital-io' as const,
      ledAddress: base,
      switchAddress: base,
      buttonAddress: base + 2,
    })),
  ];
}

function removePanelKinds(layout: PanelLayoutDocument, kinds: Set<PanelKind>): void {
  for (const [id, panel] of Object.entries(layout.instances)) {
    if (!kinds.has(panel.kind)) continue;
    delete layout.instances[id];
    layout.floatingPanelIds = layout.floatingPanelIds.filter((candidate) => candidate !== id);
    for (const column of layout.columns)
      column.panelIds = column.panelIds.filter((candidate) => candidate !== id);
  }
}

export function resolveSourceIdeLayout(
  directive: SourceIdeDirective,
  baseline: PanelLayoutDocument
): { layout: PanelLayoutDocument; diagnostics: string[] } {
  const layout = directive.layout ? createPanelPreset(directive.layout) : structuredClone(baseline);
  const diagnostics: string[] = [];
  const replaceKinds = new Set<PanelKind>();
  if (directive.display) replaceKinds.add('hardware-display');
  if (directive.digitalIo) replaceKinds.add('hardware-digital-io');
  if (replaceKinds.size) removePanelKinds(layout, replaceKinds);

  const devices = sourceIdeHardwareDevices(directive);
  for (const device of devices) {
    const kind: PanelKind =
      device.deviceType === 'display' ? 'hardware-display' : 'hardware-digital-io';
    const targetColumnIndex =
      kind === 'hardware-display'
        ? Math.min(1, layout.columns.length - 1)
        : Math.min(2, layout.columns.length - 1);
    const id = `panel-${device.id}`;
    const similarCount = Object.values(layout.instances).filter(
      (panel) => panel.kind === kind
    ).length;
    layout.instances[id] = {
      id,
      kind,
      minimized: false,
      title: `${getPanelDefaultTitle(kind)} ${similarCount + 1}`,
      config:
        device.deviceType === 'display'
          ? { kind: 'hardware-display', deviceId: device.id, displayBase: device.displayBase }
          : {
              kind: 'hardware-digital-io',
              deviceId: device.id,
              ledAddress: device.ledAddress,
              switchAddress: device.switchAddress,
              buttonAddress: device.buttonAddress,
              bitLabels: createDigitalIoBitLabels(),
            },
    };
    layout.columns[targetColumnIndex]?.panelIds.push(id);
  }

  if (directive.memory !== undefined) {
    const memoryPanel = Object.values(layout.instances).find((panel) => panel.kind === 'memory');
    if (memoryPanel?.config.kind === 'memory') memoryPanel.config.startAddress = directive.memory;
    else diagnostics.push('The selected layout does not contain a memory panel.');
  }
  if (directive.graphicsScale !== undefined || directive.graphicsSmoothing !== undefined) {
    const graphics = Object.values(layout.instances).find((panel) => panel.kind === 'graphics');
    if (graphics?.config.kind === 'graphics') {
      if (directive.graphicsScale !== undefined)
        graphics.config.scaleMode = directive.graphicsScale;
      if (directive.graphicsSmoothing !== undefined)
        graphics.config.smoothing = directive.graphicsSmoothing;
    } else diagnostics.push('The selected layout does not contain a graphics panel.');
  }
  if (directive.focus) {
    const focused = Object.values(layout.instances).find((panel) => panel.kind === directive.focus);
    if (focused) {
      focused.minimized = false;
      layout.focusedPanelId = focused.id;
      if (focused.kind === 'terminal') layout.terminalOwnerPanelId = focused.id;
    } else diagnostics.push(`The selected layout does not contain a ${directive.focus} panel.`);
  }
  return { layout, diagnostics };
}
