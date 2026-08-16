import { describe, expect, it } from 'vitest';
import { createAddressSpacePolicy } from './addressSpace';
import {
  AddressTranslationFault,
  TranslatingMemoryBus,
  type AddressTranslationPort,
} from './addressTranslation';
import {
  CoprocessorRegistry,
  type CoprocessorDevice,
  type CoprocessorRequest,
  type CoprocessorStateSnapshot,
} from './coprocessor';
import { RamBus, SparseRamBus } from './memoryBus';
import { cpuSupports, getCpuCapabilities } from '../isa/cpuCapabilities';
import { createProgramImage } from '../assembler/programImage';
import { StrictM68000Core } from './core';

function fakeCoprocessor(id: 1 | 2, result: number): CoprocessorDevice {
  let value = result;
  return {
    id,
    device: `fake-${id}`,
    compatibleCpuModels: new Set(['m68020']),
    execute: (_request: CoprocessorRequest) => ({ kind: 'operand-transfer', value: Uint8Array.of(value) }),
    snapshot: () => ({ device: `fake-${id}`, version: 1, payload: { value } }),
    restore: (snapshot: CoprocessorStateSnapshot) => {
      value = (snapshot.payload as { value: number }).value;
    },
    reset: () => {
      value = result;
    },
  };
}

describe('MC68020 architecture foundations', () => {
  it('declares model capabilities without ordinal model checks', () => {
    expect(getCpuCapabilities('m68020')).toMatchObject({
      addressBits: 32,
      allowsUnalignedData: true,
      hasMasterStack: true,
      hasInstructionCache: true,
    });
    expect(cpuSupports('m68010', 'cas')).toBe(false);
    expect(cpuSupports('m68020', 'cas')).toBe(true);
  });

  it('wraps addresses per model and permits only MC68020 unaligned data', () => {
    const m68000 = createAddressSpacePolicy('m68000');
    const m68020 = createAddressSpacePolicy('m68020');
    expect(m68000.normalize(0x1234_5678)).toBe(0x34_5678);
    expect(m68020.normalize(0x1234_5678)).toBe(0x1234_5678);
    expect(() => m68000.assertAccess(1, 'read', 2)).toThrow(/Unaligned/);
    expect(m68020.assertAccess(1, 'read', 2)).toBe(1);
    expect(() => m68020.assertAccess(1, 'fetch', 2)).toThrow(/Unaligned/);
  });

  it('loads and reads sparse data at high 32-bit addresses', () => {
    const bus = new SparseRamBus(createAddressSpacePolicy('m68020'));
    bus.load(0xffff_fffc, Uint8Array.of(0x12, 0x34, 0x56, 0x78));
    expect(bus.read32(0xffff_fffc)).toBe(0x1234_5678);
    bus.write32(1, 0xaabb_ccdd);
    expect(bus.read32(1)).toBe(0xaabb_ccdd);
  });

  it('keeps simultaneous coprocessor slots independent and snapshots by namespace', () => {
    const registry = new CoprocessorRegistry([fakeCoprocessor(1, 0x11), fakeCoprocessor(2, 0x22)]);
    const request = (id: 1 | 2): CoprocessorRequest => ({
      id,
      operation: 'general',
      commandWord: 0,
      extensionWords: [],
      instructionAddress: 0x1000,
      functionCode: 6,
      supervisor: true,
    });
    expect(registry.execute(request(1), 'm68020')).toMatchObject({
      kind: 'operand-transfer',
      value: Uint8Array.of(0x11),
    });
    expect(registry.execute(request(2), 'm68020')).toMatchObject({
      kind: 'operand-transfer',
      value: Uint8Array.of(0x22),
    });
    expect(Object.keys(registry.snapshot())).toEqual(['1', '2']);
    expect(registry.execute({ ...request(1), id: 3 }, 'm68020')).toMatchObject({
      kind: 'exception',
      vector: 11,
    });
  });

  it('translates, protects, and faults logical accesses ahead of the physical bus', () => {
    const translator: AddressTranslationPort = {
      device: 'fake-translator',
      translate: (request) =>
        request.logicalAddress === 0x2000
          ? { kind: 'fault', code: 'protection-fault', message: 'protected', vector: 7 }
          : { kind: 'translated', physicalAddress: request.logicalAddress + 0x100 },
      snapshot: () => ({ device: 'fake-translator', version: 1, payload: null }),
      restore: () => undefined,
      reset: () => undefined,
    };
    const physical = new RamBus({ size: 0x4000 });
    const logical = new TranslatingMemoryBus(physical, translator);
    logical.write8(0x1000, 0xaa);
    expect(physical.read8(0x1100)).toBe(0xaa);
    expect(() => logical.read8(0x2000)).toThrow(AddressTranslationFault);
  });

  it('routes core fetches and atomic CAS requests through the translator', () => {
    const requests: Array<{ address: number; atomic: boolean }> = [];
    const translator: AddressTranslationPort = {
      device: 'core-translator',
      translate: (request) => {
        requests.push({ address: request.logicalAddress, atomic: request.atomic });
        return { kind: 'translated', physicalAddress: request.logicalAddress + 0x100 };
      },
      snapshot: () => ({ device: 'core-translator', version: 1, payload: null }),
      restore: () => undefined,
      reset: () => undefined,
    };
    const physical = new SparseRamBus(createAddressSpacePolicy('m68020'));
    const core = new StrictM68000Core({
      cpuModel: 'm68020',
      bus: physical,
      addressTranslator: translator,
      state: { sr: 0x2700, isp: 0x8000, addressRegisters: [0x2000] },
    });
    core.state.d[0] = 1;
    core.state.d[1] = 2;
    core.loadProgram(createProgramImage([{ bytes: Uint8Array.of(0x0e, 0xd0, 0x00, 0x40), line: 1 }], { origin: 0x1000 }));
    physical.write32(0x2100, 1);
    expect(core.step()).toMatchObject({ kind: 'executed' });
    expect(physical.read32(0x2100)).toBe(2);
    expect(requests).toContainEqual({ address: 0x1000, atomic: false });
    expect(requests).toContainEqual({ address: 0x2000, atomic: true });
  });

  it('round-trips CPU, coprocessor, translator, and execution state by namespace', () => {
    let coprocessorValue = 7;
    let translationOffset = 0x100;
    const coprocessor: CoprocessorDevice = {
      id: 1,
      device: 'snapshot-coprocessor',
      compatibleCpuModels: new Set(['m68020']),
      execute: () => ({ kind: 'completed' }),
      snapshot: () => ({
        device: 'snapshot-coprocessor',
        version: 1,
        payload: { value: coprocessorValue },
      }),
      restore: (snapshot) => {
        coprocessorValue = (snapshot.payload as { value: number }).value;
      },
      reset: () => {
        coprocessorValue = 0;
      },
    };
    const translator: AddressTranslationPort = {
      device: 'snapshot-translator',
      translate: (request) => ({
        kind: 'translated',
        physicalAddress: request.logicalAddress + translationOffset,
      }),
      snapshot: () => ({
        device: 'snapshot-translator',
        version: 1,
        payload: { offset: translationOffset },
      }),
      restore: (snapshot) => {
        translationOffset = (snapshot.payload as { offset: number }).offset;
      },
      reset: () => {
        translationOffset = 0;
      },
    };
    const core = new StrictM68000Core({
      cpuModel: 'm68020',
      coprocessors: [coprocessor],
      addressTranslator: translator,
    });
    core.state.d[0] = 0x1234;
    core.state.msp = 0x5678;
    const snapshot = core.snapshotSystem();

    core.state.d[0] = 0;
    core.state.msp = 0;
    coprocessorValue = 99;
    translationOffset = 0x400;
    core.restoreSystem(snapshot);

    expect(core.state.d[0]).toBe(0x1234);
    expect(core.state.msp).toBe(0x5678);
    expect(coprocessorValue).toBe(7);
    expect(translationOffset).toBe(0x100);
    expect(snapshot).toMatchObject({ version: 1, cpuModel: 'm68020' });
  });
});
