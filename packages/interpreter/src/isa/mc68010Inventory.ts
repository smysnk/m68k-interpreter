export interface Mc68010InstructionInventoryEntry {
  id: string;
  encoding: string;
  extension: string;
  sizes: string;
  operands: string;
  privileged: boolean;
  flags: string;
  exceptions: string;
  busEffect: string;
}

export const MC68010_INSTRUCTION_INVENTORY: readonly Mc68010InstructionInventoryEntry[] = [
  {
    id: 'bkpt.vector',
    encoding: '$4848-$484F',
    extension: 'none',
    sizes: 'unsized',
    operands: '#0-#7',
    privileged: false,
    flags: 'preserved',
    exceptions: 'illegal instruction after breakpoint acknowledge',
    busEffect: 'CPU-space breakpoint-acknowledge event',
  },
  {
    id: 'move.from-ccr',
    encoding: '$42C0 + EA',
    extension: 'EA-dependent',
    sizes: 'word',
    operands: 'CCR to data-alterable EA',
    privileged: false,
    flags: 'preserved',
    exceptions: 'illegal effective address, bus/address error',
    busEffect: 'ordinary destination data write',
  },
  {
    id: 'movec.control-to-register',
    encoding: '$4E7A',
    extension: 'general register and 12-bit control selector',
    sizes: 'long',
    operands: 'SFC/DFC/USP/VBR to Dn/An',
    privileged: true,
    flags: 'preserved',
    exceptions: 'privilege violation, illegal selector',
    busEffect: 'instruction fetch only',
  },
  {
    id: 'movec.register-to-control',
    encoding: '$4E7B',
    extension: 'general register and 12-bit control selector',
    sizes: 'long',
    operands: 'Dn/An to SFC/DFC/USP/VBR',
    privileged: true,
    flags: 'preserved',
    exceptions: 'privilege violation, illegal selector',
    busEffect: 'instruction fetch only',
  },
  {
    id: 'moves.memory-to-register',
    encoding: '$0E00/$0E40/$0E80 + EA',
    extension: 'register, direction, and EA extension words',
    sizes: 'byte, word, long',
    operands: 'memory-alterable EA to Dn/An',
    privileged: true,
    flags: 'preserved',
    exceptions: 'privilege violation, illegal effective address, bus/address error',
    busEffect: 'memory read uses SFC',
  },
  {
    id: 'moves.register-to-memory',
    encoding: '$0E00/$0E40/$0E80 + EA',
    extension: 'register, direction, and EA extension words',
    sizes: 'byte, word, long',
    operands: 'Dn/An to memory-alterable EA',
    privileged: true,
    flags: 'preserved',
    exceptions: 'privilege violation, illegal effective address, bus/address error',
    busEffect: 'memory write uses DFC',
  },
  {
    id: 'rtd.displacement',
    encoding: '$4E74',
    extension: 'signed 16-bit displacement',
    sizes: 'word displacement',
    operands: 'implied stack and displacement',
    privileged: false,
    flags: 'preserved',
    exceptions: 'bus/address error',
    busEffect: 'ordinary stack data read',
  },
] as const;

export const MC68010_ARCHITECTURAL_DIFFERENCES = [
  ['Control state', 'VBR (32-bit), SFC (3-bit), and DFC (3-bit)'],
  ['Vector lookup', 'VBR plus four times the vector number'],
  ['Normal exception frame', 'format 0: SR, PC, format/vector word'],
  ['Bus/address fault frame', 'format 8: 29 words with restart PC and fault metadata'],
  ['RTE', 'validates formats 0 and 8; invalid formats raise vector 14'],
  ['MOVE from SR', 'privileged on MC68010; unprivileged on MC68000'],
] as const;

export const MC68010_DEFERRED_PHYSICAL_BUS_SCOPE = [
  'pin-level asynchronous timing and arbitration',
  'exact breakpoint-acknowledge signal timing',
  'prefetch-queue contents and fetch-stage attribution',
  'transparent loop-mode fetch suppression',
  'cycle-by-cycle restart microsequencing beyond architectural resume',
] as const;
