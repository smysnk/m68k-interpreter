const FILE_MAGIC = 0x1a3f5d71;
const TEST_MAGIC = 0xabc12367;
const NAME_MAGIC = 0x89abcdef;
const STATE_MAGIC = 0x01234567;
const TRANSACTION_MAGIC = 0x456789ab;

const REGISTER_ORDER = [
  'd0',
  'd1',
  'd2',
  'd3',
  'd4',
  'd5',
  'd6',
  'd7',
  'a0',
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
  'usp',
  'ssp',
  'sr',
  'pc',
] as const;

export interface MameVectorState {
  registers: Record<(typeof REGISTER_ORDER)[number], number>;
  prefetch: [number, number];
  ram: Array<[address: number, value: number]>;
}

export interface MameVectorTransaction {
  type: 'n' | 'w' | 'r' | 't' | 're' | 'we';
  cycles: number;
  functionCode?: number;
  address?: number;
  size?: 'byte' | 'word';
  data?: number;
  uds?: number;
  lds?: number;
}

export interface MameSingleStepVector {
  name: string;
  initial: MameVectorState;
  final: MameVectorState;
  cycles: number;
  transactions: MameVectorTransaction[];
}

class BinaryReader {
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  text(length: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }
}

function expectSection(reader: BinaryReader, magic: number): void {
  reader.u32();
  const actual = reader.u32();
  if (actual !== magic) {
    throw new Error(
      `Unexpected MAME vector section magic ${actual.toString(16)} at ${reader.offset - 4}`
    );
  }
}

function readState(reader: BinaryReader): MameVectorState {
  expectSection(reader, STATE_MAGIC);
  const registers = {} as MameVectorState['registers'];
  for (const register of REGISTER_ORDER) {
    registers[register] = reader.u32();
  }
  const prefetch: [number, number] = [reader.u32(), reader.u32()];
  const ramWordCount = reader.u32();
  const ram: Array<[number, number]> = [];

  for (let index = 0; index < ramWordCount; index += 1) {
    const address = reader.u32();
    const value = reader.u16();
    ram.push([address, value >>> 8], [address | 1, value & 0xff]);
  }

  return { registers, prefetch, ram };
}

function readTransactions(reader: BinaryReader): {
  cycles: number;
  transactions: MameVectorTransaction[];
} {
  expectSection(reader, TRANSACTION_MAGIC);
  const cycles = reader.u32();
  const count = reader.u32();
  const transactions: MameVectorTransaction[] = [];
  const transactionType = ['n', 'w', 'r', 't', 're', 'we'] as const;

  for (let index = 0; index < count; index += 1) {
    const type = transactionType[reader.u8()];
    const transactionCycles = reader.u32();
    if (type === undefined) {
      throw new Error(`Unknown MAME transaction type at index ${index}`);
    }
    if (type === 'n') {
      transactions.push({ type, cycles: transactionCycles });
      continue;
    }

    const functionCode = reader.u32();
    const address = reader.u32();
    const data = reader.u32();
    const uds = reader.u32();
    const lds = reader.u32();
    transactions.push({
      type,
      cycles: transactionCycles,
      functionCode,
      address,
      size: uds + lds === 2 ? 'word' : 'byte',
      data,
      uds,
      lds,
    });
  }

  return { cycles, transactions };
}

function readVector(reader: BinaryReader): MameSingleStepVector {
  expectSection(reader, TEST_MAGIC);
  expectSection(reader, NAME_MAGIC);
  const name = reader.text(reader.u32());
  const initial = readState(reader);
  const final = readState(reader);
  const { cycles, transactions } = readTransactions(reader);
  return { name, initial, final, cycles, transactions };
}

export function decodeMameVectorFile(
  bytes: Uint8Array,
  options: { limit?: number } = {}
): { declaredCount: number; vectors: MameSingleStepVector[] } {
  const reader = new BinaryReader(bytes);
  const magic = reader.u32();
  if (magic !== FILE_MAGIC) {
    throw new Error(`Unexpected MAME vector file magic: ${magic.toString(16)}`);
  }
  const declaredCount = reader.u32();
  const limit = Math.min(options.limit ?? declaredCount, declaredCount);
  const vectors: MameSingleStepVector[] = [];
  for (let index = 0; index < limit; index += 1) {
    vectors.push(readVector(reader));
  }
  return { declaredCount, vectors };
}
