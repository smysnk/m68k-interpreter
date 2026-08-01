import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  normalizeDeviceAddress,
  validateEasy68kHardwareDevices,
} from '@m68k/interpreter';
import { createPanelPreset } from '@/panels/panelPresets';
import {
  MAX_PANEL_COLUMNS,
  MAX_PANEL_INSTANCES,
  MIN_PANEL_COLUMNS,
  PANEL_KINDS,
  PANEL_LAYOUT_SCHEMA_VERSION,
  createPanelConfiguration,
  getPanelDefaultTitle,
  getPanelHardwareDeviceConfigs,
  type FloatingPanelRect,
  type PanelConfiguration,
  type PanelInstance,
  type PanelKind,
  type PanelLayoutDocument,
  type PanelLayoutState,
  type SavedPanelView,
} from '@/store/panelLayoutTypes';
import type { UiShellState, WorkspaceTab } from '@/store/uiShellSlice';

const PANEL_KIND_SET = new Set<PanelKind>(PANEL_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function address(value: unknown, fallback: number): number {
  return normalizeDeviceAddress(finite(value, fallback));
}

export function clampFloatingRect(value: unknown): FloatingPanelRect {
  const rect = isRecord(value) ? value : {};
  return {
    x: Math.max(0, finite(rect.x, 32)),
    y: Math.max(0, finite(rect.y, 32)),
    width: Math.max(280, finite(rect.width, 520)),
    height: Math.max(180, finite(rect.height, 420)),
  };
}

function migrateV1ToV2(value: Record<string, unknown>): Record<string, unknown> {
  if (finite(value.schemaVersion, 1) >= 2 || !isRecord(value.instances)) {
    return value;
  }

  const instances = { ...value.instances };
  const replacements = new Map<string, string[]>();
  let expandedCount = Object.keys(instances).filter(
    (id) => !isRecord(instances[id]) || instances[id].kind !== 'hardware'
  ).length;

  for (const [id, raw] of Object.entries(value.instances)) {
    if (!isRecord(raw) || raw.kind !== 'hardware') continue;
    delete instances[id];
    const kinds: readonly PanelKind[] = ['hardware-display', 'hardware-digital-io'];
    const ids: string[] = [];
    for (const kind of kinds) {
      if (expandedCount >= MAX_PANEL_INSTANCES) break;
      const migratedId = `${id}-${kind.replace('hardware-', '')}`;
      const floatingRect = raw.floatingRect
        ? {
            ...clampFloatingRect(raw.floatingRect),
            x: clampFloatingRect(raw.floatingRect).x + ids.length * 28,
            y: clampFloatingRect(raw.floatingRect).y + ids.length * 28,
          }
        : undefined;
      instances[migratedId] = {
        ...raw,
        id: migratedId,
        kind,
        title: getPanelDefaultTitle(kind),
        config:
          kind === 'hardware-display'
            ? {
                kind,
                deviceId: 'device-legacy-hardware-display',
                displayBase: 0xe00000,
              }
            : kind === 'hardware-digital-io'
              ? {
                  kind,
                  deviceId: 'device-legacy-hardware-digital-io',
                  ledAddress: 0xe00010,
                  switchAddress: 0xe00010,
                  buttonAddress: 0xe00012,
                }
              : { kind },
        ...(floatingRect ? { floatingRect } : {}),
      };
      ids.push(migratedId);
      expandedCount += 1;
    }
    replacements.set(id, ids);
  }

  const replaceIds = (rawIds: unknown): unknown[] =>
    Array.isArray(rawIds)
      ? rawIds.flatMap((id) => (typeof id === 'string' ? (replacements.get(id) ?? [id]) : []))
      : [];
  const columns = Array.isArray(value.columns)
    ? value.columns.map((rawColumn) =>
        isRecord(rawColumn) ? { ...rawColumn, panelIds: replaceIds(rawColumn.panelIds) } : rawColumn
      )
    : value.columns;
  const focusedPanelId =
    typeof value.focusedPanelId === 'string'
      ? (replacements.get(value.focusedPanelId)?.[0] ?? value.focusedPanelId)
      : value.focusedPanelId;

  return {
    ...value,
    schemaVersion: 2,
    instances,
    columns,
    floatingPanelIds: replaceIds(value.floatingPanelIds),
    focusedPanelId,
  };
}

function migrateV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  if (finite(value.schemaVersion, 1) >= 3 || !isRecord(value.instances)) {
    return value;
  }

  const instances = { ...value.instances };
  const removedIds = new Set<string>();
  let digitalIoId = Object.entries(instances).find(
    ([, raw]) => isRecord(raw) && raw.kind === 'hardware-digital-io'
  )?.[0];

  for (const [id, raw] of Object.entries(instances)) {
    if (!isRecord(raw)) continue;
    if (raw.kind === 'hardware-digital-io') {
      instances[id] = {
        ...raw,
        title: getPanelDefaultTitle('hardware-digital-io'),
      };
      continue;
    }
    if (raw.kind !== 'hardware-interrupts') continue;

    if (!digitalIoId) {
      digitalIoId = id;
      instances[id] = {
        ...raw,
        kind: 'hardware-digital-io',
        title: getPanelDefaultTitle('hardware-digital-io'),
        config: {
          kind: 'hardware-digital-io',
          deviceId: `device-${id}`,
          ledAddress: DEFAULT_EASY68K_HARDWARE_CONFIG.ledAddress,
          switchAddress: DEFAULT_EASY68K_HARDWARE_CONFIG.switchAddress,
          buttonAddress: DEFAULT_EASY68K_HARDWARE_CONFIG.buttonAddress,
        },
      };
    } else {
      delete instances[id];
      removedIds.add(id);
    }
  }

  const withoutRemoved = (rawIds: unknown): unknown[] =>
    Array.isArray(rawIds)
      ? rawIds.filter((id) => typeof id === 'string' && !removedIds.has(id))
      : [];
  const columns = Array.isArray(value.columns)
    ? value.columns.map((rawColumn) =>
        isRecord(rawColumn)
          ? { ...rawColumn, panelIds: withoutRemoved(rawColumn.panelIds) }
          : rawColumn
      )
    : value.columns;
  const focusedPanelId =
    typeof value.focusedPanelId === 'string' && removedIds.has(value.focusedPanelId)
      ? (digitalIoId ?? null)
      : value.focusedPanelId;

  return {
    ...value,
    schemaVersion: 3,
    instances,
    columns,
    floatingPanelIds: withoutRemoved(value.floatingPanelIds),
    focusedPanelId,
  };
}

function migratePanelLayoutDocument(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let migrated = value;
  if (finite(migrated.schemaVersion, 1) < 2) {
    migrated = migrateV1ToV2(migrated);
  }
  if (finite(migrated.schemaVersion, 1) < 3) {
    migrated = migrateV2ToV3(migrated);
  }
  return migrated;
}

function normalizeConfiguration(
  kind: PanelKind,
  id: string,
  raw: unknown,
  existingInstances: Iterable<PanelInstance>
): PanelConfiguration {
  const source = isRecord(raw) ? raw : {};
  if (kind === 'code') {
    return {
      kind,
      ...(typeof source.fileId === 'string' ? { fileId: source.fileId } : {}),
    };
  }
  if (kind === 'memory') {
    return {
      kind,
      ...(typeof source.startAddress === 'number'
        ? { startAddress: normalizeDeviceAddress(source.startAddress) }
        : {}),
    };
  }
  if (kind === 'hardware-display') {
    const existingDevices = getPanelHardwareDeviceConfigs(existingInstances);
    const fallback = createPanelConfiguration(kind, {
      instanceId: id,
      existingDevices,
    });
    if (fallback.kind !== kind) return fallback;
    const candidate = {
      kind,
      deviceId:
        typeof source.deviceId === 'string' && source.deviceId.trim()
          ? source.deviceId.trim().slice(0, 100)
          : fallback.deviceId,
      displayBase: address(source.displayBase, fallback.displayBase),
    } as const;
    const existing = existingDevices.find((device) => device.id === candidate.deviceId);
    if (existing) {
      return { ...candidate, displayBase: existing.displayBase };
    }
    const validation = validateEasy68kHardwareDevices([
      ...existingDevices,
      {
        id: candidate.deviceId,
        deviceType: 'display',
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        displayBase: candidate.displayBase,
      },
    ]);
    return validation.valid ? candidate : fallback;
  }
  if (kind === 'hardware-digital-io') {
    const existingDevices = getPanelHardwareDeviceConfigs(existingInstances);
    const fallback = createPanelConfiguration(kind, {
      instanceId: id,
      existingDevices,
    });
    if (fallback.kind !== kind) return fallback;
    const candidate = {
      kind,
      deviceId:
        typeof source.deviceId === 'string' && source.deviceId.trim()
          ? source.deviceId.trim().slice(0, 100)
          : fallback.deviceId,
      ledAddress: address(source.ledAddress, fallback.ledAddress),
      switchAddress: address(source.switchAddress, fallback.switchAddress),
      buttonAddress: address(source.buttonAddress, fallback.buttonAddress),
    } as const;
    const existing = existingDevices.find((device) => device.id === candidate.deviceId);
    if (existing) {
      return {
        ...candidate,
        ledAddress: existing.ledAddress,
        switchAddress: existing.switchAddress,
        buttonAddress: existing.buttonAddress,
      };
    }
    const validation = validateEasy68kHardwareDevices([
      ...existingDevices,
      {
        id: candidate.deviceId,
        deviceType: 'digital-io',
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        ledAddress: candidate.ledAddress,
        switchAddress: candidate.switchAddress,
        buttonAddress: candidate.buttonAddress,
      },
    ]);
    return validation.valid ? candidate : fallback;
  }
  return createPanelConfiguration(kind, { instanceId: id });
}

export function normalizePanelLayoutDocument(value: unknown): PanelLayoutDocument {
  const migrated = migratePanelLayoutDocument(value);
  if (!isRecord(migrated) || !Array.isArray(migrated.columns) || !isRecord(migrated.instances)) {
    return createPanelPreset('classic');
  }

  const sourceInstances = migrated.instances as Record<string, unknown>;
  const instances: PanelLayoutDocument['instances'] = {};
  for (const [id, raw] of Object.entries(sourceInstances).slice(0, MAX_PANEL_INSTANCES)) {
    if (
      !isRecord(raw) ||
      typeof raw.kind !== 'string' ||
      !PANEL_KIND_SET.has(raw.kind as PanelKind)
    ) {
      continue;
    }
    const kind = raw.kind as PanelKind;
    const panel: PanelInstance = {
      id,
      kind,
      title:
        typeof raw.title === 'string' && raw.title.trim()
          ? raw.title.trim().slice(0, 80)
          : getPanelDefaultTitle(kind),
      minimized: raw.minimized === true,
      config: normalizeConfiguration(kind, id, raw.config, Object.values(instances)),
      ...(raw.floatingRect ? { floatingRect: clampFloatingRect(raw.floatingRect) } : {}),
    };
    instances[id] = panel;
  }

  const requestedCount = Math.trunc(finite(migrated.columnCount, migrated.columns.length));
  const columnCount = Math.min(MAX_PANEL_COLUMNS, Math.max(MIN_PANEL_COLUMNS, requestedCount));
  const seen = new Set<string>();
  const columns = migrated.columns.slice(0, columnCount).map((rawColumn, index) => {
    const column = isRecord(rawColumn) ? rawColumn : {};
    const panelIds = Array.isArray(column.panelIds)
      ? column.panelIds.filter((id): id is string => {
          if (typeof id !== 'string' || !instances[id] || seen.has(id)) return false;
          seen.add(id);
          delete instances[id].floatingRect;
          return true;
        })
      : [];
    return {
      id: typeof column.id === 'string' ? column.id : `column-${index + 1}`,
      width: finite(column.width, 100 / columnCount),
      panelIds,
    };
  });
  while (columns.length < columnCount) {
    columns.push({
      id: `column-${columns.length + 1}`,
      width: 100 / columnCount,
      panelIds: [],
    });
  }

  const floatingPanelIds = Array.isArray(migrated.floatingPanelIds)
    ? migrated.floatingPanelIds.filter((id): id is string => {
        if (typeof id !== 'string' || !instances[id] || seen.has(id)) return false;
        seen.add(id);
        instances[id].floatingRect = clampFloatingRect(instances[id].floatingRect);
        return true;
      })
    : [];
  for (const id of Object.keys(instances)) {
    if (!seen.has(id)) {
      columns[0].panelIds.push(id);
      delete instances[id].floatingRect;
      seen.add(id);
    }
  }

  if (Object.keys(instances).length === 0) return createPanelPreset('classic');
  const equalWidth = 100 / columns.length;
  const totalWidth = columns.reduce((total, column) => total + Math.max(0.1, column.width), 0);
  for (const column of columns) {
    column.width = totalWidth > 0 ? (Math.max(0.1, column.width) / totalWidth) * 100 : equalWidth;
  }
  const terminalIds = Object.values(instances)
    .filter((panel) => panel.kind === 'terminal')
    .map((panel) => panel.id);
  const focusedPanelId =
    typeof migrated.focusedPanelId === 'string' && instances[migrated.focusedPanelId]
      ? migrated.focusedPanelId
      : null;
  const requestedOwner =
    typeof migrated.terminalOwnerPanelId === 'string' ? migrated.terminalOwnerPanelId : null;

  return {
    schemaVersion: PANEL_LAYOUT_SCHEMA_VERSION,
    name: typeof migrated.name === 'string' ? migrated.name.slice(0, 80) : 'Workspace',
    columnCount: columns.length,
    columns,
    floatingPanelIds,
    instances,
    focusedPanelId,
    terminalOwnerPanelId:
      requestedOwner && terminalIds.includes(requestedOwner)
        ? requestedOwner
        : (terminalIds[0] ?? null),
    nextInstanceSequence: Math.max(
      1,
      Math.trunc(finite(migrated.nextInstanceSequence, Object.keys(instances).length + 1))
    ),
    nextColumnSequence: Math.max(
      columns.length + 1,
      Math.trunc(finite(migrated.nextColumnSequence, columns.length + 1))
    ),
  };
}

export function normalizePanelLayoutState(value: unknown): PanelLayoutState {
  const source = isRecord(value) ? value : {};
  const rawViews = isRecord(source.userViews) ? source.userViews : {};
  const userViews: Record<string, SavedPanelView> = {};
  for (const [id, rawView] of Object.entries(rawViews).slice(0, 20)) {
    if (!isRecord(rawView) || typeof rawView.name !== 'string' || id.startsWith('preset:')) {
      continue;
    }
    const now = new Date(0).toISOString();
    userViews[id] = {
      id,
      name: rawView.name.trim().slice(0, 60) || 'Saved view',
      createdAt: typeof rawView.createdAt === 'string' ? rawView.createdAt : now,
      updatedAt: typeof rawView.updatedAt === 'string' ? rawView.updatedAt : now,
      document: normalizePanelLayoutDocument(rawView.document),
    };
  }
  const userViewOrder = Array.isArray(source.userViewOrder)
    ? source.userViewOrder.filter(
        (id): id is string => typeof id === 'string' && Boolean(userViews[id])
      )
    : [];
  for (const id of Object.keys(userViews)) {
    if (!userViewOrder.includes(id)) userViewOrder.push(id);
  }
  return {
    activeLayout: normalizePanelLayoutDocument(source.activeLayout),
    activeSourceViewId:
      typeof source.activeSourceViewId === 'string' &&
      (source.activeSourceViewId.startsWith('preset:') ||
        Boolean(userViews[source.activeSourceViewId]))
        ? source.activeSourceViewId
        : null,
    activeLayoutDirty: source.activeLayoutDirty === true,
    userViews,
    userViewOrder,
  };
}

export function getPanelLayoutInvariantErrors(document: PanelLayoutDocument): string[] {
  const errors: string[] = [];
  if (
    document.columnCount !== document.columns.length ||
    document.columnCount < 1 ||
    document.columnCount > 4
  ) {
    errors.push('invalid column count');
  }
  const placements = [
    ...document.columns.flatMap((column) => column.panelIds),
    ...document.floatingPanelIds,
  ];
  if (new Set(placements).size !== placements.length) errors.push('duplicate placement');
  if (placements.length !== Object.keys(document.instances).length) {
    errors.push('instances must be placed exactly once');
  }
  if (placements.some((id) => !document.instances[id])) {
    errors.push('placement references missing instance');
  }
  if (
    document.terminalOwnerPanelId &&
    document.instances[document.terminalOwnerPanelId]?.kind !== 'terminal'
  ) {
    errors.push('terminal owner is invalid');
  }
  const devices = getPanelHardwareDeviceConfigs(Object.values(document.instances));
  if (new Set(devices.map((device) => device.id)).size !== devices.length) {
    errors.push('hardware device IDs must be unique after mirrored bindings are normalized');
  }
  return errors;
}

function legacyKindToPanelKinds(
  kind: WorkspaceTab | 'registers' | 'memory' | 'hardware'
): PanelKind[] {
  if (kind === 'hardware') {
    return ['hardware-display', 'hardware-digital-io'];
  }
  return [kind];
}

export function migrateLegacyPanelLayout(
  uiShell: Partial<UiShellState> | undefined
): PanelLayoutState {
  const workspaceKind = (uiShell?.workspaceTab ?? 'terminal') as WorkspaceTab;
  const inspectorKind = uiShell?.inspectorView ?? 'registers';
  const kinds = [
    ...legacyKindToPanelKinds(workspaceKind),
    ...legacyKindToPanelKinds(inspectorKind),
  ];
  if (kinds[0] === kinds[1]) kinds[1] = kinds[0] === 'terminal' ? 'registers' : 'terminal';
  if (uiShell?.contextOpen && uiShell.contextView === 'help') kinds.push('help');
  const widths = kinds.map(() => 100 / kinds.length);
  const instances: PanelLayoutDocument['instances'] = {};
  const columns = kinds.map((kind, index) => {
    const id = `panel-${kind}-${index + 1}`;
    instances[id] = {
      id,
      kind,
      title: getPanelDefaultTitle(kind),
      minimized: false,
      config: createPanelConfiguration(kind, {
        instanceId: id,
        existingDevices: getPanelHardwareDeviceConfigs(Object.values(instances)),
      }),
    };
    return { id: `column-${index + 1}`, width: widths[index], panelIds: [id] };
  });
  return normalizePanelLayoutState({
    activeLayout: {
      schemaVersion: PANEL_LAYOUT_SCHEMA_VERSION,
      name: 'Migrated workspace',
      columnCount: columns.length,
      columns,
      floatingPanelIds: [],
      instances,
      focusedPanelId: columns[0]?.panelIds[0] ?? null,
      terminalOwnerPanelId:
        Object.values(instances).find((panel) => panel.kind === 'terminal')?.id ?? null,
      nextInstanceSequence: kinds.length + 1,
      nextColumnSequence: kinds.length + 1,
    },
  });
}
