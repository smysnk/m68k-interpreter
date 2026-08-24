import type { CpuModel } from './types';

export type CpuInstructionFeature =
  | 'm68000-base'
  | 'bkpt'
  | 'movec'
  | 'moves'
  | 'rtd'
  | 'move-from-ccr'
  | 'long-branch'
  | 'full-indexed-addressing'
  | 'bitfield'
  | 'cas'
  | 'cas2'
  | 'chk2-cmp2'
  | 'trapcc'
  | 'pack-unpk'
  | 'long-multiply-divide'
  | 'link-long'
  | 'extb'
  | 'callm-rtm'
  | 'coprocessor-interface';

export interface CpuCapabilities {
  readonly model: CpuModel;
  readonly addressBits: 24 | 32;
  readonly addressMask: number;
  readonly allowsUnalignedData: boolean;
  readonly hasVectorBaseRegister: boolean;
  readonly hasRestartableFaults: boolean;
  readonly hasMasterStack: boolean;
  readonly hasInstructionCache: boolean;
  readonly exceptionFrameFamily: 'm68000' | 'm68010' | 'm68020';
  readonly instructionFeatures: ReadonlySet<CpuInstructionFeature>;
}

const BASE_FEATURES: readonly CpuInstructionFeature[] = ['m68000-base'];
const MC68010_FEATURES: readonly CpuInstructionFeature[] = [
  ...BASE_FEATURES,
  'bkpt',
  'movec',
  'moves',
  'rtd',
  'move-from-ccr',
];
const MC68020_FEATURES: readonly CpuInstructionFeature[] = [
  ...MC68010_FEATURES,
  'long-branch',
  'full-indexed-addressing',
  'bitfield',
  'cas',
  'cas2',
  'chk2-cmp2',
  'trapcc',
  'pack-unpk',
  'long-multiply-divide',
  'link-long',
  'extb',
  'callm-rtm',
  'coprocessor-interface',
];

export const CPU_CAPABILITIES: Readonly<Record<CpuModel, CpuCapabilities>> = {
  m68000: Object.freeze({
    model: 'm68000',
    addressBits: 24,
    addressMask: 0x00ff_ffff,
    allowsUnalignedData: false,
    hasVectorBaseRegister: false,
    hasRestartableFaults: false,
    hasMasterStack: false,
    hasInstructionCache: false,
    exceptionFrameFamily: 'm68000',
    instructionFeatures: new Set(BASE_FEATURES),
  }),
  m68010: Object.freeze({
    model: 'm68010',
    addressBits: 24,
    addressMask: 0x00ff_ffff,
    allowsUnalignedData: false,
    hasVectorBaseRegister: true,
    hasRestartableFaults: true,
    hasMasterStack: false,
    hasInstructionCache: false,
    exceptionFrameFamily: 'm68010',
    instructionFeatures: new Set(MC68010_FEATURES),
  }),
  m68020: Object.freeze({
    model: 'm68020',
    addressBits: 32,
    addressMask: 0xffff_ffff,
    allowsUnalignedData: true,
    hasVectorBaseRegister: true,
    hasRestartableFaults: true,
    hasMasterStack: true,
    hasInstructionCache: true,
    exceptionFrameFamily: 'm68020',
    instructionFeatures: new Set(MC68020_FEATURES),
  }),
};

export function getCpuCapabilities(model: CpuModel): CpuCapabilities {
  return CPU_CAPABILITIES[model];
}

export function cpuSupports(model: CpuModel, feature: CpuInstructionFeature): boolean {
  return CPU_CAPABILITIES[model].instructionFeatures.has(feature);
}
