import type { EffectiveAddressClass } from '../isa/types';
import type { OperandSize } from './alu';
import { signExtend, truncate } from './alu';
import type { InstructionStream } from './instructionStream';
import type { AddressSpacePolicy } from './addressSpace';
import {
  SUPERVISOR_DATA_READ,
  SUPERVISOR_DATA_WRITE,
  USER_DATA_READ,
  USER_DATA_WRITE,
  type BusAccessInput,
  type MemoryBus,
} from './memoryBus';
import type { M68kCpuState } from './state';

export type EffectiveAddressAccess = 'read' | 'write' | 'readwrite' | 'address';

export interface EffectiveAddress {
  readonly class: EffectiveAddressClass;
  readonly mode: number;
  readonly register: number;
  readonly address?: number;
  read(): number;
  write(value: number): void;
  resolveAddress(): number;
}

export interface EffectiveAddressContext {
  state: M68kCpuState;
  bus: MemoryBus;
  stream: InstructionStream;
  size: OperandSize;
  access: EffectiveAddressAccess;
  readContext?: BusAccessInput;
  writeContext?: BusAccessInput;
  addressSpace?: AddressSpacePolicy;
}

function addressStep(size: OperandSize, register: number): number {
  return size === 1 && register === 7 ? 2 : size;
}

function readMemory(
  bus: MemoryBus,
  address: number,
  size: OperandSize,
  context?: BusAccessInput
): number {
  if (size === 1) return bus.read8(address, context);
  if (size === 2) return bus.read16(address, context);
  return bus.read32(address, context);
}

function writeMemory(
  bus: MemoryBus,
  address: number,
  value: number,
  size: OperandSize,
  context?: BusAccessInput
): void {
  if (size === 1) bus.write8(address, value, context);
  else if (size === 2) bus.write16(address, value, context);
  else bus.write32(address, value, context);
}

function readIndex(extension: number, state: M68kCpuState): number {
  const addressRegister = (extension & 0x8000) !== 0;
  const register = (extension >>> 12) & 0x7;
  const longIndex = (extension & 0x0800) !== 0;
  const raw = addressRegister ? state.a[register] : state.d[register];
  const value = longIndex ? raw | 0 : signExtend(raw, 2);
  const scale = state.cpuModel === 'm68020' ? 1 << ((extension >>> 9) & 0x3) : 1;
  return value * scale;
}

function readDisplacement(stream: InstructionStream, sizeCode: number): number {
  if (sizeCode === 2) return stream.readSignedWord();
  if (sizeCode === 3) return stream.readLong() | 0;
  return 0;
}

function resolveIndexedAddress(
  base: number,
  extension: number,
  context: EffectiveAddressContext,
  pcRelative: boolean
): { address: number; class: EffectiveAddressClass } {
  const { state, bus, stream } = context;
  const addressSpace = context.addressSpace ?? state.addressSpace;
  if (state.cpuModel !== 'm68020' || (extension & 0x0100) === 0) {
    // Address registers and indexed calculations remain 32-bit on every model.
    // The MC68000/MC68010 bus performs the physical 24-bit aliasing when the
    // operand is accessed; normalizing here would discard the observable
    // logical effective address used by debuggers and exception metadata.
    const address = (base + readIndex(extension, state) + signExtend(extension & 0xff, 1)) >>> 0;
    return {
      address,
      class: pcRelative ? 'pc-indexed' : 'indexed',
    };
  }

  const baseSuppressed = (extension & 0x0080) !== 0;
  const indexSuppressed = (extension & 0x0040) !== 0;
  const baseDisplacementSize = (extension >>> 4) & 0x3;
  if ((extension & 0x0008) !== 0 || baseDisplacementSize === 0) {
    throw new RangeError('Reserved MC68020 full-index extension encoding');
  }
  const baseDisplacement = readDisplacement(stream, baseDisplacementSize);
  const indirectSelection = extension & 0x7;
  if (indirectSelection === 4) {
    throw new RangeError('Reserved MC68020 full-index extension selection');
  }
  const index = indexSuppressed ? 0 : readIndex(extension, state);
  const baseValue = baseSuppressed ? 0 : base;
  const baseAddress = addressSpace.add(baseValue, baseDisplacement);
  if (indirectSelection === 0) {
    return {
      address: addressSpace.add(baseAddress, index),
      class: pcRelative ? 'pc-full-indexed' : 'full-indexed',
    };
  }

  const outerSize = indirectSelection & 0x3;
  const outerDisplacement = readDisplacement(stream, outerSize);
  const postindexed = indirectSelection >= 5;
  const pointerAddress = postindexed ? baseAddress : addressSpace.add(baseAddress, index);
  const readContext =
    context.readContext ?? (state.isSupervisor() ? SUPERVISOR_DATA_READ : USER_DATA_READ);
  const pointer = bus.read32(pointerAddress, readContext);
  return {
    address: addressSpace.add(postindexed ? pointer + index : pointer, outerDisplacement),
    class: pcRelative
      ? postindexed
        ? 'pc-memory-indirect-postindexed'
        : 'pc-memory-indirect-preindexed'
      : postindexed
        ? 'memory-indirect-postindexed'
        : 'memory-indirect-preindexed',
  };
}

export function classifyEffectiveAddress(mode: number, register: number): EffectiveAddressClass {
  switch (mode & 0x7) {
    case 0:
      return 'data-register';
    case 1:
      return 'address-register';
    case 2:
      return 'address-indirect';
    case 3:
      return 'postincrement';
    case 4:
      return 'predecrement';
    case 5:
      return 'displacement';
    case 6:
      return 'indexed';
    case 7:
      switch (register & 0x7) {
        case 0:
          return 'absolute-short';
        case 1:
          return 'absolute-long';
        case 2:
          return 'pc-displacement';
        case 3:
          return 'pc-indexed';
        case 4:
          return 'immediate';
        default:
          return 'none';
      }
    default:
      return 'none';
  }
}

export function isEffectiveAddressAllowed(
  mode: number,
  register: number,
  allowed: readonly EffectiveAddressClass[]
): boolean {
  return allowed.includes(classifyEffectiveAddress(mode, register));
}

export function resolveEffectiveAddress(
  mode: number,
  register: number,
  context: EffectiveAddressContext
): EffectiveAddress {
  const normalizedMode = mode & 0x7;
  const normalizedRegister = register & 0x7;
  const eaClass = classifyEffectiveAddress(normalizedMode, normalizedRegister);
  const { state, bus, stream, size, access } = context;
  const readContext =
    context.readContext ?? (state.isSupervisor() ? SUPERVISOR_DATA_READ : USER_DATA_READ);
  const writeContext =
    context.writeContext ?? (state.isSupervisor() ? SUPERVISOR_DATA_WRITE : USER_DATA_WRITE);

  if (eaClass === 'none') {
    throw new RangeError(`Illegal effective address mode ${normalizedMode}/${normalizedRegister}`);
  }

  if (eaClass === 'data-register' || eaClass === 'address-register') {
    const registers = eaClass === 'data-register' ? state.d : state.a;
    return {
      class: eaClass,
      mode: normalizedMode,
      register: normalizedRegister,
      read: () => truncate(registers[normalizedRegister], size),
      write: (value) => {
        if (eaClass === 'address-register' || size === 4) {
          registers[normalizedRegister] = value | 0;
          return;
        }
        const mask = size === 1 ? 0xff : 0xffff;
        registers[normalizedRegister] =
          (registers[normalizedRegister] & ~mask) | (value & mask) | 0;
      },
      resolveAddress: () => {
        throw new TypeError('Register-direct operands do not have a memory address');
      },
    };
  }

  if (eaClass === 'immediate') {
    if (access !== 'read') {
      throw new TypeError('Immediate effective addresses are read-only');
    }
    const value = size === 4 ? stream.readLong() : stream.readWord() & (size === 1 ? 0xff : 0xffff);
    return {
      class: eaClass,
      mode: normalizedMode,
      register: normalizedRegister,
      read: () => value,
      write: () => {
        throw new TypeError('Immediate effective addresses are read-only');
      },
      resolveAddress: () => {
        throw new TypeError('Immediate operands do not have a memory address');
      },
    };
  }

  let address: number;
  let resolvedClass: EffectiveAddressClass = eaClass;
  let postIncrement = false;
  switch (eaClass) {
    case 'address-indirect':
      address = state.a[normalizedRegister] >>> 0;
      break;
    case 'postincrement':
      address = state.a[normalizedRegister] >>> 0;
      postIncrement = true;
      break;
    case 'predecrement':
      state.a[normalizedRegister] =
        ((state.a[normalizedRegister] >>> 0) - addressStep(size, normalizedRegister)) | 0;
      address = state.a[normalizedRegister] >>> 0;
      break;
    case 'displacement':
      address = ((state.a[normalizedRegister] >>> 0) + stream.readSignedWord()) >>> 0;
      break;
    case 'indexed': {
      const extension = stream.readWord();
      const resolved = resolveIndexedAddress(
        state.a[normalizedRegister] >>> 0,
        extension,
        context,
        false
      );
      address = resolved.address;
      resolvedClass = resolved.class;
      break;
    }
    case 'absolute-short':
      address = signExtend(stream.readWord(), 2) >>> 0;
      break;
    case 'absolute-long':
      address = stream.readLong();
      break;
    case 'pc-displacement': {
      const base = stream.cursor;
      address = (base + stream.readSignedWord()) >>> 0;
      break;
    }
    case 'pc-indexed': {
      const base = stream.cursor;
      const extension = stream.readWord();
      const resolved = resolveIndexedAddress(base, extension, context, true);
      address = resolved.address;
      resolvedClass = resolved.class;
      break;
    }
    default:
      throw new RangeError(`Unsupported effective address class: ${eaClass}`);
  }
  let sideEffectApplied = false;
  const applyPostIncrement = (): void => {
    if (!postIncrement || sideEffectApplied) return;
    state.a[normalizedRegister] =
      ((state.a[normalizedRegister] >>> 0) + addressStep(size, normalizedRegister)) | 0;
    sideEffectApplied = true;
  };

  return {
    class: resolvedClass,
    mode: normalizedMode,
    register: normalizedRegister,
    address,
    read: () => {
      const value = readMemory(bus, address, size, readContext);
      applyPostIncrement();
      return value;
    },
    write: (value) => {
      writeMemory(bus, address, value, size, writeContext);
      applyPostIncrement();
    },
    resolveAddress: () => address,
  };
}
