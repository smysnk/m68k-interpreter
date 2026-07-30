export type CpuProfile = 'm68000' | 'm68010' | 'easy68k';

export type InstructionSize = 'byte' | 'word' | 'long' | 'unsized';

export type EffectiveAddressClass =
  | 'none'
  | 'data-register'
  | 'address-register'
  | 'address-indirect'
  | 'postincrement'
  | 'predecrement'
  | 'displacement'
  | 'indexed'
  | 'absolute-short'
  | 'absolute-long'
  | 'pc-displacement'
  | 'pc-indexed'
  | 'immediate'
  | 'quick-immediate'
  | 'register-list'
  | 'condition-displacement'
  | 'trap-vector';

export type StatusFlag = 'x' | 'n' | 'z' | 'v' | 'c';

export type FlagEffect = 'affected' | 'cleared' | 'preserved' | 'undefined';

export type InstructionSupport =
  'implemented-needs-audit' | 'missing' | 'compatibility-only' | 'extension-only';

export interface InstructionEncoding {
  mask: number;
  value: number;
  extensionWords?: number | 'variable';
}

export interface InstructionForm {
  id: string;
  mnemonic: string;
  form: string;
  minimumProfile: CpuProfile;
  sizes: readonly InstructionSize[];
  source: readonly EffectiveAddressClass[];
  destination: readonly EffectiveAddressClass[];
  privileged?: boolean;
  flags?: Partial<Record<StatusFlag, FlagEffect>>;
  possibleExceptions?: readonly string[];
  encoding?: InstructionEncoding;
  support: InstructionSupport;
  notes?: string;
}

export interface IsaManifestValidationIssue {
  code:
    | 'duplicate-form-id'
    | 'empty-mnemonic'
    | 'empty-size-set'
    | 'encoding-out-of-range'
    | 'encoding-value-outside-mask';
  formId: string;
  message: string;
}

export interface IsaCoverageSummary {
  totalForms: number;
  byProfile: Record<CpuProfile, number>;
  bySupport: Record<InstructionSupport, number>;
  uniqueMnemonics: number;
}
