import type { CpuModel, CpuProfile, EmulationConfig, MachineProfile } from './types';

export interface CpuModelDefinition {
  id: CpuModel;
  label: string;
  description: string;
  capabilities: readonly string[];
}

export interface MachineProfileDefinition {
  id: MachineProfile;
  label: string;
  description: string;
  capabilities: {
    terminal: boolean;
    easy68kTraps: boolean;
    mappedHardware: boolean;
    architecturalInterrupts: true;
  };
  disconnectedMessage?: string;
}

export const CPU_MODEL_REGISTRY: Readonly<Record<CpuModel, CpuModelDefinition>> = {
  m68000: {
    id: 'm68000',
    label: 'MC68000',
    description: 'Original ISA · 24-bit addressing',
    capabilities: ['m68000-instructions', 'architectural-interrupts'],
  },
  m68010: {
    id: 'm68010',
    label: 'MC68010',
    description: 'Adds VBR · restartable faults · MOVEC/MOVES',
    capabilities: [
      'm68000-instructions',
      'm68010-instructions',
      'm68010-control-registers',
      'restartable-faults',
      'architectural-interrupts',
    ],
  },
  m68020: {
    id: 'm68020',
    label: 'MC68020',
    description: 'Adds 32-bit addressing · full indexing · bitfields/CAS',
    capabilities: [
      'm68000-instructions',
      'm68010-instructions',
      'm68020-instructions',
      'm68020-control-registers',
      'full-indexed-addressing',
      '32-bit-address-space',
      'restartable-faults',
      'coprocessor-interface',
      'architectural-interrupts',
    ],
  },
};

export const MACHINE_PROFILE_REGISTRY: Readonly<Record<MachineProfile, MachineProfileDefinition>> =
  {
    bare: {
      id: 'bare',
      label: 'Bare',
      description: 'RAM and architectural CPU interrupts without simulator services',
      capabilities: {
        terminal: false,
        easy68kTraps: false,
        mappedHardware: false,
        architecturalInterrupts: true,
      },
      disconnectedMessage: 'Connect the Easy68K machine to use memory-mapped hardware.',
    },
    easy68k: {
      id: 'easy68k',
      label: 'Easy68K',
      description: 'Terminal, trainer-board hardware, and Easy68K trap services',
      capabilities: {
        terminal: true,
        easy68kTraps: true,
        mappedHardware: true,
        architecturalInterrupts: true,
      },
    },
  };

export const DEFAULT_EMULATION_CONFIG: Readonly<EmulationConfig> = Object.freeze({
  cpuModel: 'm68000',
  machineProfile: 'easy68k',
});

export const LEGACY_CPU_PROFILE_CONFIG: Readonly<Record<CpuProfile, EmulationConfig>> = {
  m68000: { cpuModel: 'm68000', machineProfile: 'bare' },
  m68010: { cpuModel: 'm68010', machineProfile: 'bare' },
  m68020: { cpuModel: 'm68020', machineProfile: 'bare' },
  easy68k: { cpuModel: 'm68000', machineProfile: 'easy68k' },
};

export function isCpuModel(value: unknown): value is CpuModel {
  return typeof value === 'string' && value in CPU_MODEL_REGISTRY;
}

export function isMachineProfile(value: unknown): value is MachineProfile {
  return typeof value === 'string' && value in MACHINE_PROFILE_REGISTRY;
}

export function normalizeEmulationConfig(
  value?: Partial<EmulationConfig> | null,
  legacyProfile?: CpuProfile | null
): EmulationConfig {
  const legacy =
    legacyProfile === null || legacyProfile === undefined
      ? DEFAULT_EMULATION_CONFIG
      : (LEGACY_CPU_PROFILE_CONFIG[legacyProfile] ?? DEFAULT_EMULATION_CONFIG);
  return {
    cpuModel: isCpuModel(value?.cpuModel) ? value.cpuModel : legacy.cpuModel,
    machineProfile: isMachineProfile(value?.machineProfile)
      ? value.machineProfile
      : legacy.machineProfile,
  };
}

export function toLegacyCpuProfile(config: EmulationConfig): CpuProfile | undefined {
  if (config.cpuModel === 'm68000' && config.machineProfile === 'easy68k') return 'easy68k';
  if (config.machineProfile === 'bare') return config.cpuModel;
  return undefined;
}
