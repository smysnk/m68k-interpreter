import { describe, expect, it } from 'vitest';
import { createAddressSpacePolicy } from './addressSpace';
import { decodeExceptionFrame, encodeExceptionFrame } from './exceptionFrames';
import { SparseRamBus } from './memoryBus';

describe('model-specific exception frame codecs', () => {
  it.each([
    ['m68010', 8, 58, 10],
    ['m68020', 0xa, 32, 16],
  ] as const)('round trips %s bus faults', (cpuModel, format, size, addressOffset) => {
    const bus = new SparseRamBus(createAddressSpacePolicy(cpuModel));
    const bytes = encodeExceptionFrame({
      cpuModel,
      vector: 2,
      statusRegister: 0x2700,
      programCounter: 0x1234_5678,
      faultAddress: 0x89ab_cdef,
      functionCode: 5,
      write: true,
    });
    bus.load(0x1000, bytes);
    expect(bytes).toHaveLength(size);
    expect(bytes[6] >>> 4).toBe(format);
    expect(bus.read32(0x1000 + addressOffset)).toBe(0x89ab_cdef);
    expect(decodeExceptionFrame(bus, 0x1000, cpuModel)).toMatchObject({
      format,
      vector: 2,
      statusRegister: 0x2700,
      programCounter: 0x1234_5678,
      faultAddress: 0x89ab_cdef,
      size,
    });
  });

  it('rejects malformed MC68020 frames deterministically', () => {
    const bus = new SparseRamBus(createAddressSpacePolicy('m68020'));
    bus.write16(6, 0x5000);
    expect(() => decodeExceptionFrame(bus, 0, 'm68020')).toThrow(/format 5/);
  });
});
