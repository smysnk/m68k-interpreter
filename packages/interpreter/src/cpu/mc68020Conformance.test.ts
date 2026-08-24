import { describe, expect, it } from 'vitest';
import { createProgramImage } from '../assembler/programImage';
import type { ModuleAccessPort } from './moduleAccess';
import type { CoprocessorDevice, CoprocessorRequest } from './coprocessor';
import { StrictM68000Core } from './core';

function words(...values: number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => [(value >>> 8) & 0xff, value & 0xff]));
}

function coreFor(
  bytes: Uint8Array,
  options: ConstructorParameters<typeof StrictM68000Core>[0] = {}
): StrictM68000Core {
  const core = new StrictM68000Core({
    ...options,
    cpuModel: 'm68020',
    state: { sr: 0x2700, isp: 0x8000, ...options.state },
  });
  core.loadProgram(createProgramImage([{ bytes, line: 1 }], { origin: 0x1000 }));
  return core;
}

describe('MC68020 instruction forms', () => {
  it('executes a 32-bit BRA displacement while preserving $ff as an 8-bit displacement on MC68000', () => {
    const bytes = words(0x60ff, 0x0000, 0x0006);
    expect(coreFor(bytes).step()).toMatchObject({ kind: 'executed', pcAfter: 0x1008 });

    const oldCore = new StrictM68000Core({ state: { pc: 0x1000 } });
    oldCore.bus.load?.(0x1000, bytes);
    expect(oldCore.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1001 });
  });

  it('executes EXTB.L and LINK.L', () => {
    const extb = coreFor(words(0x49c0));
    extb.state.d[0] = 0x1234_5680;
    expect(extb.step()).toMatchObject({ kind: 'executed' });
    expect(extb.state.d[0]).toBe(-128);

    const link = coreFor(words(0x4808, 0xffff, 0xfff8), {
      state: { addressRegisters: [0x2222], isp: 0x8000 },
    });
    expect(link.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1006 });
    expect(link.state.a[0] >>> 0).toBe(0x7ffc);
    expect(link.state.a[7] >>> 0).toBe(0x7ff4);
    expect(link.bus.read32(0x7ffc)).toBe(0x2222);
  });

  it('executes CHK.L and non-taking TRAPF', () => {
    const chk = coreFor(words(0x4300)); // CHK.L D0,D1
    chk.state.d[0] = 10;
    chk.state.d[1] = 5;
    expect(chk.step()).toMatchObject({ kind: 'executed' });

    const trapf = coreFor(words(0x51fc));
    expect(trapf.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1002 });
  });

  it('packs and unpacks data-register decimal fields', () => {
    const pack = coreFor(words(0x8340, 0x0000)); // PACK D0,D1,#0
    pack.state.d[0] = 0x1234;
    pack.state.d[1] = 0x5566_7700;
    expect(pack.step()).toMatchObject({ kind: 'executed' });
    expect(pack.state.d[1] >>> 0).toBe(0x5566_7724);

    const unpk = coreFor(words(0x8380, 0x0000)); // UNPK D0,D1,#0
    unpk.state.d[0] = 0x24;
    unpk.state.d[1] = 0x5566_0000;
    expect(unpk.step()).toMatchObject({ kind: 'executed' });
    expect(unpk.state.d[1] >>> 0).toBe(0x5566_0204);
  });

  it('extracts and modifies wrapping register bitfields', () => {
    const extract = coreFor(words(0xe9c0, 0x1208)); // BFEXTU D0{8:8},D1
    extract.state.d[0] = 0x12ab_0000;
    expect(extract.step()).toMatchObject({ kind: 'executed' });
    expect(extract.state.d[1]).toBe(0xab);

    const change = coreFor(words(0xeac0, 0x07c4)); // BFCHG D0{31:4}
    change.state.d[0] = 0x0000_0001;
    expect(change.step()).toMatchObject({ kind: 'executed' });
    expect(change.state.d[0] >>> 0).toBe(0xe000_0000);
  });

  it('performs CAS.L as one bus transaction and updates the compare register on failure', () => {
    const success = coreFor(words(0x0ed0, 0x0040), { state: { addressRegisters: [0x2000] } });
    success.state.d[0] = 0x1122_3344;
    success.state.d[1] = 0xaabb_ccdd | 0;
    success.bus.write32(0x2000, 0x1122_3344);
    expect(success.step()).toMatchObject({ kind: 'executed' });
    expect(success.bus.read32(0x2000)).toBe(0xaabb_ccdd);

    const failure = coreFor(words(0x0ed0, 0x0040), { state: { addressRegisters: [0x2000] } });
    failure.state.d[0] = 1;
    failure.state.d[1] = 2;
    failure.bus.write32(0x2000, 3);
    expect(failure.step()).toMatchObject({ kind: 'executed' });
    expect(failure.state.d[0]).toBe(3);
    expect(failure.bus.read32(0x2000)).toBe(3);
  });

  it('executes 32-bit multiply and divide extension forms', () => {
    const multiply = coreFor(words(0x4c00, 0x1000)); // MULU.L D0,D1
    multiply.state.d[0] = 3;
    multiply.state.d[1] = 7;
    expect(multiply.step()).toMatchObject({ kind: 'executed' });
    expect(multiply.state.d[1]).toBe(21);

    const divide = coreFor(words(0x4c40, 0x1002)); // DIVU.L D0,D2:D1
    divide.state.d[0] = 3;
    divide.state.d[1] = 10;
    expect(divide.step()).toMatchObject({ kind: 'executed' });
    expect(divide.state.d[1]).toBe(3);
    expect(divide.state.d[2]).toBe(1);
  });

  it('evaluates CMP2/CHK2 bounds and raises vector 6 only for CHK2', () => {
    const cmp2 = coreFor(words(0x04d0, 0x0000), { state: { addressRegisters: [0x2000] } });
    cmp2.bus.write32(0x2000, 5);
    cmp2.bus.write32(0x2004, 10);
    cmp2.state.d[0] = 12;
    expect(cmp2.step()).toMatchObject({ kind: 'executed' });
    expect(cmp2.state.ccr & 1).toBe(1);

    const chk2 = coreFor(words(0x04d0, 0x0800), { state: { addressRegisters: [0x2000] } });
    chk2.bus.write32(0x2000, 5);
    chk2.bus.write32(0x2004, 10);
    chk2.state.d[0] = 12;
    expect(chk2.step()).toMatchObject({ kind: 'exception', fault: { vector: 6 } });
  });

  it('routes CALLM and RTM through the injected module-access port', () => {
    const calls: string[] = [];
    const moduleAccess: ModuleAccessPort = {
      call: (request) => {
        calls.push(`call:${request.module}:${request.entryAddress.toString(16)}`);
        return { kind: 'completed', programCounter: 0x3000 };
      },
      return: (request) => {
        calls.push(`return:${request.generalRegister}`);
        return { kind: 'completed', programCounter: 0x4000 };
      },
    };
    const callm = coreFor(words(0x06d0, 0x0007), {
      moduleAccess,
      state: { addressRegisters: [0x2000] },
    });
    expect(callm.step()).toMatchObject({ kind: 'executed', pcAfter: 0x3000 });
    const rtm = coreFor(words(0x06c0), { moduleAccess });
    expect(rtm.step()).toMatchObject({ kind: 'executed', pcAfter: 0x4000 });
    expect(calls).toEqual(['call:7:2000', 'return:0']);
  });

  it('raises the architected line-F exception when no coprocessor is attached', () => {
    const core = coreFor(words(0xf200, 0x0000));
    expect(core.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'coprocessor-exception', vector: 11 },
    });
  });

  it('routes a generic coprocessor command to the addressed slot', () => {
    const commands: number[] = [];
    const device: CoprocessorDevice = {
      id: 1,
      device: 'test-coprocessor',
      compatibleCpuModels: new Set(['m68020']),
      execute: (request) => {
        commands.push(request.commandWord);
        return { kind: 'completed', stateChanged: true };
      },
      snapshot: () => ({ device: 'test-coprocessor', version: 1, payload: { commands } }),
      restore: () => undefined,
      reset: () => commands.splice(0),
    };
    const core = coreFor(words(0xf200, 0x1234), { coprocessors: [device] });
    expect(core.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1004 });
    expect(commands).toEqual([0x1234]);
  });

  it('consumes coprocessor branch displacements before testing the condition', () => {
    const requests: CoprocessorRequest[] = [];
    const device: CoprocessorDevice = {
      id: 1,
      device: 'branch-coprocessor',
      compatibleCpuModels: new Set(['m68020']),
      execute: (request) => {
        requests.push(request);
        return { kind: 'condition', true: true };
      },
      snapshot: () => ({ device: 'branch-coprocessor', version: 1, payload: null }),
      restore: () => undefined,
      reset: () => undefined,
    };
    const wordBranch = coreFor(words(0xf285, 0x0006), { coprocessors: [device] });
    expect(wordBranch.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1008 });
    expect(requests[0]).toMatchObject({
      operation: 'branch',
      commandWord: 5,
      extensionWords: [6],
    });

    const longBranch = coreFor(words(0xf2c5, 0x0000, 0x0010), { coprocessors: [device] });
    expect(longBranch.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1012 });
    expect(requests[1]).toMatchObject({ extensionWords: [0, 0x10] });
  });

  it('executes coprocessor save, restore, set, decrement-branch, and trap envelopes', () => {
    const restored: number[][] = [];
    const device: CoprocessorDevice = {
      id: 1,
      device: 'protocol-coprocessor',
      compatibleCpuModels: new Set(['m68020']),
      execute: (request) => {
        if (request.operation === 'save') {
          return { kind: 'operand-transfer', value: Uint8Array.of(0xaa, 0xbb) };
        }
        if (request.operation === 'restore') {
          restored.push(Array.from(request.effectiveAddress?.read(2) ?? []));
          return { kind: 'completed' };
        }
        if (request.operation === 'decrement-branch') return { kind: 'condition', true: false };
        return { kind: 'condition', true: true };
      },
      snapshot: () => ({ device: 'protocol-coprocessor', version: 1, payload: null }),
      restore: () => undefined,
      reset: () => undefined,
    };

    const save = coreFor(words(0xf310), {
      coprocessors: [device],
      state: { addressRegisters: [0x2000] },
    });
    expect(save.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1002 });
    expect(save.bus.read16(0x2000)).toBe(0xaabb);

    const restore = coreFor(words(0xf350), {
      coprocessors: [device],
      state: { addressRegisters: [0x2000] },
    });
    restore.bus.write16(0x2000, 0x1234);
    expect(restore.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1002 });
    expect(restored).toEqual([[0x12, 0x34]]);

    const set = coreFor(words(0xf250, 0x0005), {
      coprocessors: [device],
      state: { addressRegisters: [0x2000] },
    });
    expect(set.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1004 });
    expect(set.bus.read8(0x2000)).toBe(0xff);

    const decrementBranch = coreFor(words(0xf248, 0x0005, 0x0006), {
      coprocessors: [device],
    });
    decrementBranch.state.d[0] = 1;
    expect(decrementBranch.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1008 });
    expect(decrementBranch.state.d[0]).toBe(0);

    const trap = coreFor(words(0xf27c, 0x0005), { coprocessors: [device] });
    expect(trap.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'coprocessor-trap', vector: 7, origin: { kind: 'coprocessor', slot: 1 } },
    });
  });

  it('makes the instruction cache and CACR invalidation functionally observable', () => {
    const core = coreFor(new Uint8Array(0x20).fill(0x4e));
    core.bus.write16(0x1000, 0x4e71); // NOP
    core.state.cacr = 1;
    expect(core.step()).toMatchObject({ kind: 'executed' });
    core.bus.write16(0x1000, 0x4afc); // ILLEGAL hidden by the enabled cache
    core.state.pc = 0x1000;
    expect(core.step()).toMatchObject({ kind: 'executed' });

    core.bus.write16(0x1010, 0x4e7b); // MOVEC D0,CACR
    core.bus.write16(0x1012, 0x0002);
    core.state.d[0] = 0x8;
    core.state.pc = 0x1010;
    expect(core.step()).toMatchObject({ kind: 'executed' });
    expect(core.state.cacr).toBe(0);
    core.state.pc = 0x1000;
    expect(core.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'illegal-instruction' },
    });
  });
});
