import type {
  CpuModel,
  EffectiveAddressClass,
  InstructionForm,
  InstructionSize,
  InstructionSupport,
  IsaCoverageSummary,
  IsaManifestValidationIssue,
  MachineCompatibilityEvidence,
} from './types';

const NONE = ['none'] as const;
const DATA_REGISTER = ['data-register'] as const;
const ADDRESS_REGISTER = ['address-register'] as const;
const REGISTER_DIRECT = ['data-register', 'address-register'] as const;
const MEMORY = [
  'address-indirect',
  'postincrement',
  'predecrement',
  'displacement',
  'indexed',
  'absolute-short',
  'absolute-long',
] as const;
const CONTROL = [
  'address-indirect',
  'displacement',
  'indexed',
  'absolute-short',
  'absolute-long',
  'pc-displacement',
  'pc-indexed',
] as const;
const DATA_SOURCE = [
  'data-register',
  ...MEMORY,
  'pc-displacement',
  'pc-indexed',
  'immediate',
] as const;
const DATA_ALTERABLE = ['data-register', ...MEMORY] as const;
const MEMORY_ALTERABLE = [...MEMORY] as const;
const ALL_SOURCE = ['data-register', 'address-register', ...MEMORY, 'immediate'] as const;

interface FormOptions {
  minimumCpuModel?: CpuModel;
  sizes?: readonly InstructionSize[];
  source?: readonly EffectiveAddressClass[];
  destination?: readonly EffectiveAddressClass[];
  privileged?: boolean;
  support?: InstructionSupport;
  notes?: string;
  encoding?: { mask: number; value: number; extensionWords?: number | 'variable' };
}

function form(mnemonic: string, name: string, options: FormOptions = {}): InstructionForm {
  return {
    id: `${mnemonic.toLowerCase()}.${name}`,
    mnemonic: mnemonic.toUpperCase(),
    form: name,
    minimumCpuModel: options.minimumCpuModel ?? 'm68000',
    sizes: options.sizes ?? ['unsized'],
    source: options.source ?? NONE,
    destination: options.destination ?? NONE,
    privileged: options.privileged,
    support: options.support ?? 'missing',
    notes: options.notes,
    encoding: options.encoding,
  };
}

const IMPLEMENTED = 'conformant' as const;
const STRICT_CORE_PARTIAL = 'conformant' as const;

export const M68000_ISA_MANIFEST: readonly InstructionForm[] = [
  form('ABCD', 'register', {
    sizes: ['byte'],
    source: DATA_REGISTER,
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('ABCD', 'predecrement-memory', {
    sizes: ['byte'],
    source: ['predecrement'],
    destination: ['predecrement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('ADD', 'ea-to-data-register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('ADD', 'data-register-to-ea', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: MEMORY_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ADDA', 'ea-to-address-register', {
    sizes: ['word', 'long'],
    source: ALL_SOURCE,
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('ADDI', 'immediate-to-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ADDQ', 'quick-to-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['quick-immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ADDQ', 'quick-to-address-register', {
    sizes: ['word', 'long'],
    source: ['quick-immediate'],
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('ADDX', 'register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('ADDX', 'predecrement-memory', {
    sizes: ['byte', 'word', 'long'],
    source: ['predecrement'],
    destination: ['predecrement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('AND', 'ea-to-data-register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('AND', 'data-register-to-ea', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: MEMORY_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ANDI', 'immediate-to-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ANDI', 'to-ccr', {
    sizes: ['byte'],
    source: ['immediate'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('ANDI', 'to-sr', {
    sizes: ['word'],
    source: ['immediate'],
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  ...['ASL', 'ASR', 'LSL', 'LSR', 'ROL', 'ROR'].flatMap((mnemonic) => [
    form(mnemonic, 'register-count', {
      sizes: ['byte', 'word', 'long'],
      source: DATA_REGISTER,
      destination: DATA_REGISTER,
      support: IMPLEMENTED,
    }),
    form(mnemonic, 'immediate-count', {
      sizes: ['byte', 'word', 'long'],
      source: ['quick-immediate'],
      destination: DATA_REGISTER,
      support: IMPLEMENTED,
    }),
    form(mnemonic, 'memory-one-bit', {
      sizes: ['word'],
      destination: MEMORY_ALTERABLE,
      support: STRICT_CORE_PARTIAL,
    }),
  ]),
  ...['ROXL', 'ROXR'].flatMap((mnemonic) => [
    form(mnemonic, 'register-count', {
      sizes: ['byte', 'word', 'long'],
      source: DATA_REGISTER,
      destination: DATA_REGISTER,
      support: STRICT_CORE_PARTIAL,
    }),
    form(mnemonic, 'immediate-count', {
      sizes: ['byte', 'word', 'long'],
      source: ['quick-immediate'],
      destination: DATA_REGISTER,
      support: STRICT_CORE_PARTIAL,
    }),
    form(mnemonic, 'memory-one-bit', {
      sizes: ['word'],
      destination: MEMORY_ALTERABLE,
      support: STRICT_CORE_PARTIAL,
    }),
  ]),
  form('Bcc', 'condition-displacement', {
    sizes: ['byte', 'word'],
    source: ['condition-displacement'],
    support: STRICT_CORE_PARTIAL,
    notes: 'Current runtime implements only a subset of the fourteen conditional branch forms.',
  }),
  form('BRA', 'displacement', {
    sizes: ['byte', 'word'],
    source: ['condition-displacement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('BSR', 'displacement', {
    sizes: ['byte', 'word'],
    source: ['condition-displacement'],
    support: STRICT_CORE_PARTIAL,
  }),
  ...['BCHG', 'BCLR', 'BSET', 'BTST'].flatMap((mnemonic) => [
    form(mnemonic, 'dynamic-register-bit', {
      sizes: ['byte', 'long'],
      source: DATA_REGISTER,
      destination: DATA_ALTERABLE,
      support: STRICT_CORE_PARTIAL,
    }),
    form(mnemonic, 'static-immediate-bit', {
      sizes: ['byte', 'long'],
      source: ['immediate'],
      destination: DATA_ALTERABLE,
      support: STRICT_CORE_PARTIAL,
    }),
  ]),
  form('CHK', 'word-bound', {
    sizes: ['word'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('CLR', 'data-alterable', {
    sizes: ['byte', 'word', 'long'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('CMP', 'ea-with-data-register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('CMPA', 'ea-with-address-register', {
    sizes: ['word', 'long'],
    source: ALL_SOURCE,
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('CMPI', 'immediate-with-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('CMPM', 'postincrement-memory', {
    sizes: ['byte', 'word', 'long'],
    source: ['postincrement'],
    destination: ['postincrement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('DBcc', 'data-register-displacement', {
    sizes: ['word'],
    source: DATA_REGISTER,
    destination: ['condition-displacement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('DIVS', 'word-source', {
    sizes: ['word'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('DIVU', 'word-source', {
    sizes: ['word'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('EOR', 'data-register-to-ea', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('EORI', 'immediate-to-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('EORI', 'to-ccr', {
    sizes: ['byte'],
    source: ['immediate'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('EORI', 'to-sr', {
    sizes: ['word'],
    source: ['immediate'],
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('EXG', 'register-pair', {
    sizes: ['long'],
    source: REGISTER_DIRECT,
    destination: REGISTER_DIRECT,
    support: IMPLEMENTED,
  }),
  form('EXT', 'word-or-long', {
    sizes: ['word', 'long'],
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('ILLEGAL', 'implied', { support: STRICT_CORE_PARTIAL }),
  form('JMP', 'control', { source: CONTROL, support: IMPLEMENTED }),
  form('JSR', 'control', { source: CONTROL, support: IMPLEMENTED }),
  form('LEA', 'control-to-address-register', {
    source: CONTROL,
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('LINK', 'address-register-frame', {
    sizes: ['word'],
    source: ADDRESS_REGISTER,
    destination: ['immediate'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'general', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('MOVEA', 'ea-to-address-register', {
    sizes: ['word', 'long'],
    source: ALL_SOURCE,
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('MOVE', 'to-ccr', {
    sizes: ['word'],
    source: DATA_SOURCE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'from-sr', {
    sizes: ['word'],
    destination: DATA_ALTERABLE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'to-sr', {
    sizes: ['word'],
    source: DATA_SOURCE,
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'usp-to-address-register', {
    source: ['none'],
    destination: ADDRESS_REGISTER,
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'address-register-to-usp', {
    source: ADDRESS_REGISTER,
    destination: ['none'],
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVEM', 'registers-to-memory', {
    sizes: ['word', 'long'],
    source: ['register-list'],
    destination: MEMORY_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('MOVEM', 'memory-to-registers', {
    sizes: ['word', 'long'],
    source: MEMORY,
    destination: ['register-list'],
    support: IMPLEMENTED,
  }),
  form('MOVEP', 'register-to-memory', {
    sizes: ['word', 'long'],
    source: DATA_REGISTER,
    destination: ['displacement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVEP', 'memory-to-register', {
    sizes: ['word', 'long'],
    source: ['displacement'],
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVEQ', 'immediate-to-data-register', {
    sizes: ['long'],
    source: ['quick-immediate'],
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MULS', 'word-source', {
    sizes: ['word'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('MULU', 'word-source', {
    sizes: ['word'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('NBCD', 'data-alterable', {
    sizes: ['byte'],
    destination: DATA_ALTERABLE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('NEG', 'data-alterable', {
    sizes: ['byte', 'word', 'long'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('NEGX', 'data-alterable', {
    sizes: ['byte', 'word', 'long'],
    destination: DATA_ALTERABLE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('NOP', 'implied', { support: STRICT_CORE_PARTIAL }),
  form('NOT', 'data-alterable', {
    sizes: ['byte', 'word', 'long'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('OR', 'ea-to-data-register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('OR', 'data-register-to-ea', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: MEMORY_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ORI', 'immediate-to-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('ORI', 'to-ccr', {
    sizes: ['byte'],
    source: ['immediate'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('ORI', 'to-sr', {
    sizes: ['word'],
    source: ['immediate'],
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('PEA', 'control', { source: CONTROL, support: STRICT_CORE_PARTIAL }),
  form('RESET', 'implied', { privileged: true, support: STRICT_CORE_PARTIAL }),
  form('RTR', 'implied', { support: STRICT_CORE_PARTIAL }),
  form('RTS', 'implied', { support: STRICT_CORE_PARTIAL }),
  form('SBCD', 'register', {
    sizes: ['byte'],
    source: DATA_REGISTER,
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('SBCD', 'predecrement-memory', {
    sizes: ['byte'],
    source: ['predecrement'],
    destination: ['predecrement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('Scc', 'data-alterable', {
    sizes: ['byte'],
    destination: DATA_ALTERABLE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('STOP', 'immediate-status', {
    source: ['immediate'],
    privileged: true,
    support: STRICT_CORE_PARTIAL,
  }),
  form('SUB', 'ea-from-data-register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('SUB', 'data-register-from-ea', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: MEMORY_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('SUBA', 'ea-from-address-register', {
    sizes: ['word', 'long'],
    source: ALL_SOURCE,
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('SUBI', 'immediate-from-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('SUBQ', 'quick-from-data-alterable', {
    sizes: ['byte', 'word', 'long'],
    source: ['quick-immediate'],
    destination: DATA_ALTERABLE,
    support: IMPLEMENTED,
  }),
  form('SUBQ', 'quick-from-address-register', {
    sizes: ['word', 'long'],
    source: ['quick-immediate'],
    destination: ADDRESS_REGISTER,
    support: IMPLEMENTED,
  }),
  form('SUBX', 'register', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_REGISTER,
    destination: DATA_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('SUBX', 'predecrement-memory', {
    sizes: ['byte', 'word', 'long'],
    source: ['predecrement'],
    destination: ['predecrement'],
    support: STRICT_CORE_PARTIAL,
  }),
  form('SWAP', 'data-register', {
    sizes: ['word'],
    destination: DATA_REGISTER,
    support: IMPLEMENTED,
  }),
  form('TAS', 'data-alterable', {
    sizes: ['byte'],
    destination: DATA_ALTERABLE,
    support: STRICT_CORE_PARTIAL,
  }),
  form('TRAP', 'vector', {
    source: ['trap-vector'],
    support: STRICT_CORE_PARTIAL,
    notes:
      'Architectural traps remain CPU-owned; the Easy68K machine profile intercepts only TRAP #15 services.',
  }),
  form('TRAPV', 'implied', { support: STRICT_CORE_PARTIAL }),
  form('TST', 'data-source', {
    sizes: ['byte', 'word', 'long'],
    source: DATA_SOURCE,
    support: IMPLEMENTED,
  }),
  form('UNLK', 'address-register', {
    source: ADDRESS_REGISTER,
    support: STRICT_CORE_PARTIAL,
  }),
  form('MOVE', 'from-ccr', {
    minimumCpuModel: 'm68010',
    sizes: ['word'],
    destination: DATA_ALTERABLE,
    support: 'extension-only',
  }),
  form('RTD', 'displacement', {
    minimumCpuModel: 'm68010',
    sizes: ['word'],
    source: ['immediate'],
    support: 'extension-only',
  }),
  form('BKPT', 'vector', {
    minimumCpuModel: 'm68010',
    source: ['trap-vector'],
    support: 'extension-only',
    encoding: { mask: 0xfff8, value: 0x4848 },
  }),
  form('MOVEC', 'control-to-register', {
    minimumCpuModel: 'm68010',
    sizes: ['long'],
    source: ['control-register'],
    destination: REGISTER_DIRECT,
    privileged: true,
    support: 'extension-only',
    encoding: { mask: 0xffff, value: 0x4e7a, extensionWords: 1 },
  }),
  form('MOVEC', 'register-to-control', {
    minimumCpuModel: 'm68010',
    sizes: ['long'],
    source: REGISTER_DIRECT,
    destination: ['control-register'],
    privileged: true,
    support: 'extension-only',
    encoding: { mask: 0xffff, value: 0x4e7b, extensionWords: 1 },
  }),
  form('MOVES', 'memory-to-register', {
    minimumCpuModel: 'm68010',
    sizes: ['byte', 'word', 'long'],
    source: MEMORY,
    destination: REGISTER_DIRECT,
    privileged: true,
    support: 'extension-only',
    encoding: { mask: 0xff00, value: 0x0e00, extensionWords: 'variable' },
  }),
  form('MOVES', 'register-to-memory', {
    minimumCpuModel: 'm68010',
    sizes: ['byte', 'word', 'long'],
    source: REGISTER_DIRECT,
    destination: MEMORY,
    privileged: true,
    support: 'extension-only',
    encoding: { mask: 0xff00, value: 0x0e00, extensionWords: 'variable' },
  }),
];

export const MACHINE_COMPATIBILITY_EVIDENCE: readonly MachineCompatibilityEvidence[] = [
  {
    id: 'easy68k.mode-directive',
    machineProfile: 'easy68k',
    capability: 'MODE source directive compatibility',
    support: 'compatibility-only',
    notes: 'Assembler evidence kept separate from CPU instruction coverage.',
  },
  {
    id: 'easy68k.terminal-services',
    machineProfile: 'easy68k',
    capability: 'Canonical TRAP #15 terminal tasks 5, 6, 7, 9, and 11',
    support: 'compatibility-only',
  },
  {
    id: 'easy68k.graphics-services',
    machineProfile: 'easy68k',
    capability: 'Deterministic graphics tasks 80 through 96 and task 33 geometry',
    support: 'compatibility-only',
  },
  {
    id: 'easy68k.sound-services',
    machineProfile: 'easy68k',
    capability: 'Manifest-backed WAV sound tasks 70 through 77',
    support: 'compatibility-only',
  },
  {
    id: 'easy68k.trainer-board',
    machineProfile: 'easy68k',
    capability: 'Memory-mapped trainer board and level 1-7 autovector interrupts',
    support: 'compatibility-only',
  },
];

export function validateIsaManifest(
  manifest: readonly InstructionForm[] = M68000_ISA_MANIFEST
): IsaManifestValidationIssue[] {
  const issues: IsaManifestValidationIssue[] = [];
  const ids = new Set<string>();

  for (const instruction of manifest) {
    if (ids.has(instruction.id)) {
      issues.push({
        code: 'duplicate-form-id',
        formId: instruction.id,
        message: `Duplicate instruction form id: ${instruction.id}`,
      });
    }
    ids.add(instruction.id);

    if (instruction.mnemonic.trim().length === 0) {
      issues.push({
        code: 'empty-mnemonic',
        formId: instruction.id,
        message: 'Instruction mnemonic must not be empty',
      });
    }

    if (instruction.sizes.length === 0) {
      issues.push({
        code: 'empty-size-set',
        formId: instruction.id,
        message: 'Instruction form must declare at least one size',
      });
    }

    if (instruction.encoding !== undefined) {
      const { mask, value } = instruction.encoding;
      if (
        !Number.isInteger(mask) ||
        !Number.isInteger(value) ||
        mask < 0 ||
        value < 0 ||
        mask > 0xffff ||
        value > 0xffff
      ) {
        issues.push({
          code: 'encoding-out-of-range',
          formId: instruction.id,
          message: 'Opcode mask and value must be unsigned 16-bit integers',
        });
      } else if ((value & mask) !== value) {
        issues.push({
          code: 'encoding-value-outside-mask',
          formId: instruction.id,
          message: 'Opcode value contains bits not selected by its mask',
        });
      }
    }
  }

  return issues;
}

export function summarizeIsaCoverage(
  manifest: readonly InstructionForm[] = M68000_ISA_MANIFEST
): IsaCoverageSummary {
  const byCpuModel: IsaCoverageSummary['byCpuModel'] = {
    m68000: 0,
    m68010: 0,
  };
  const machineCompatibility: IsaCoverageSummary['machineCompatibility'] = {
    bare: 0,
    easy68k: 0,
  };
  const bySupport: IsaCoverageSummary['bySupport'] = {
    missing: 0,
    'legacy-only': 0,
    'strict-core-partial': 0,
    'integrated-needs-audit': 0,
    conformant: 0,
    'compatibility-only': 0,
    'extension-only': 0,
  };
  const mnemonics = new Set<string>();

  for (const instruction of manifest) {
    byCpuModel[instruction.minimumCpuModel] += 1;
    bySupport[instruction.support] += 1;
    mnemonics.add(instruction.mnemonic);
  }

  for (const evidence of MACHINE_COMPATIBILITY_EVIDENCE) {
    machineCompatibility[evidence.machineProfile] += 1;
  }

  return {
    totalForms: manifest.length,
    byCpuModel,
    machineCompatibility,
    bySupport,
    uniqueMnemonics: mnemonics.size,
  };
}
