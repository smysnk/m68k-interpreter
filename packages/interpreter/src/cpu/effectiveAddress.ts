import type { EffectiveAddressClass } from '../isa/types';
import type { OperandSize } from './alu';
import { signExtend, truncate } from './alu';
import type { InstructionStream } from './instructionStream';
import {
  SUPERVISOR_DATA_READ,
  SUPERVISOR_DATA_WRITE,
  USER_DATA_READ,
  USER_DATA_WRITE,
  type BusAccessInput,
  type MemoryBus,
} from './memoryBus';
import type { M68000State } from './state';

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
  state: M68000State;
  bus: MemoryBus;
  stream: InstructionStream;
  size: OperandSize;
  access: EffectiveAddressAccess;
  readContext?: BusAccessInput;
  writeContext?: BusAccessInput;
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

function readIndex(extension: number, state: M68000State): number {
  const addressRegister = (extension & 0x8000) !== 0;
  const register = (extension >>> 12) & 0x7;
  const longIndex = (extension & 0x0800) !== 0;
  const raw = addressRegister ? state.a[register] : state.d[register];
  return longIndex ? raw | 0 : signExtend(raw, 2);
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
      address =
        ((state.a[normalizedRegister] >>> 0) +
          readIndex(extension, state) +
          signExtend(extension & 0xff, 1)) >>>
        0;
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
      address = (base + readIndex(extension, state) + signExtend(extension & 0xff, 1)) >>> 0;
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
    class: eaClass,
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
