import { describe, expect, it } from 'vitest';
import {
  clearMemoryBuffer,
  clearMemoryBufferDirtyPages,
  cloneMemoryBuffer,
  createMemoryBuffer,
  exportMemoryBufferMap,
  getMemoryBufferAddressRange,
  getMemoryBufferDirtyPageIndices,
  getMemoryBufferPageCount,
  getMemoryBufferUsedByteCount,
  loadMemoryBufferBaseImage,
  readMemoryBufferByte,
  readMemoryBufferRange,
  replaceMemoryBufferState,
  resetMemoryBuffer,
  writeMemoryBufferByte,
  writeMemoryBufferRange,
} from './memoryBuffer';

describe('memoryBuffer', () => {
  it('builds a sparse paged base image and preserves explicitly loaded zero bytes', () => {
    const memoryBuffer = createMemoryBuffer(
      {
        0x1000: 0x4e,
        0x1001: 0x75,
        0x2000: 0x00,
        0x2001: 0x01,
      },
      0x100
    );

    expect(getMemoryBufferPageCount(memoryBuffer)).toBe(2);
    expect(getMemoryBufferUsedByteCount(memoryBuffer)).toBe(4);
    expect(getMemoryBufferAddressRange(memoryBuffer)).toEqual({
      minAddress: 0x1000,
      maxAddress: 0x2001,
    });
    expect(readMemoryBufferByte(memoryBuffer, 0x1000)).toBe(0x4e);
    expect(readMemoryBufferByte(memoryBuffer, 0x2000)).toBe(0x00);
    expect(exportMemoryBufferMap(memoryBuffer)).toEqual({
      0x1000: 0x4e,
      0x1001: 0x75,
      0x2000: 0x00,
      0x2001: 0x01,
    });
  });

  it('uses copy-on-write pages so base image pages are not mutated during writes', () => {
    const memoryBuffer = createMemoryBuffer(
      {
        0x10: 0x12,
        0x11: 0x34,
      },
      0x10
    );
    const basePage = memoryBuffer.basePages.get(0x1);

    expect(basePage).toBeDefined();

    const basePageBytes = basePage?.bytes;
    const initialVersion = memoryBuffer.version;

    writeMemoryBufferByte(memoryBuffer, 0x11, 0x99);

    const workingPage = memoryBuffer.workingPages.get(0x1);

    expect(workingPage).toBeDefined();
    expect(workingPage).not.toBe(basePage);
    expect(workingPage?.bytes).not.toBe(basePageBytes);
    expect(basePage?.bytes[0]).toBe(0x12);
    expect(basePage?.bytes[1]).toBe(0x34);
    expect(readMemoryBufferByte(memoryBuffer, 0x11)).toBe(0x99);
    expect(getMemoryBufferDirtyPageIndices(memoryBuffer)).toEqual([0x1]);
    expect(memoryBuffer.version).toBe(initialVersion + 1);

    const versionAfterWrite = memoryBuffer.version;
    writeMemoryBufferByte(memoryBuffer, 0x11, 0x99);

    expect(memoryBuffer.version).toBe(versionAfterWrite);
  });

  it('returns modified pages to the pool on reset and reuses the same bytearray storage later', () => {
    const memoryBuffer = createMemoryBuffer(
      {
        0x10: 0xaa,
      },
      0x10
    );

    writeMemoryBufferByte(memoryBuffer, 0x11, 0xbb);

    const modifiedPage = memoryBuffer.workingPages.get(0x1);

    expect(modifiedPage).toBeDefined();

    const modifiedPageBytes = modifiedPage?.bytes;

    resetMemoryBuffer(memoryBuffer);

    expect(memoryBuffer.workingPages.size).toBe(0);
    expect(memoryBuffer.pagePool).toHaveLength(1);
    expect(readMemoryBufferByte(memoryBuffer, 0x10)).toBe(0xaa);
    expect(readMemoryBufferByte(memoryBuffer, 0x11)).toBe(0x00);
    expect(getMemoryBufferDirtyPageIndices(memoryBuffer)).toEqual([]);

    writeMemoryBufferByte(memoryBuffer, 0x12, 0xcc);

    const reusedPage = memoryBuffer.workingPages.get(0x1);

    expect(reusedPage).toBeDefined();
    expect(reusedPage?.bytes).toBe(modifiedPageBytes);
    expect(readMemoryBufferByte(memoryBuffer, 0x12)).toBe(0xcc);
    expect(getMemoryBufferUsedByteCount(memoryBuffer)).toBe(2);
  });

  it('reads and writes ranges across page boundaries while tracking only dirty pages', () => {
    const memoryBuffer = createMemoryBuffer({}, 0x4);

    writeMemoryBufferRange(memoryBuffer, 0x2, [0xaa, 0xbb, 0xcc, 0xdd, 0xee]);

    expect(Array.from(readMemoryBufferRange(memoryBuffer, 0x0, 0x8))).toEqual([
      0x00,
      0x00,
      0xaa,
      0xbb,
      0xcc,
      0xdd,
      0xee,
      0x00,
    ]);
    expect(getMemoryBufferDirtyPageIndices(memoryBuffer)).toEqual([0x0, 0x1]);
    expect(getMemoryBufferUsedByteCount(memoryBuffer)).toBe(5);

    clearMemoryBufferDirtyPages(memoryBuffer);

    expect(getMemoryBufferDirtyPageIndices(memoryBuffer)).toEqual([]);
    expect(exportMemoryBufferMap(memoryBuffer)).toEqual({
      0x2: 0xaa,
      0x3: 0xbb,
      0x4: 0xcc,
      0x5: 0xdd,
      0x6: 0xee,
    });
  });

  it('can clear all pages while keeping released page storage available for reuse', () => {
    const memoryBuffer = createMemoryBuffer(
      {
        0x08: 0x11,
        0x18: 0x22,
      },
      0x10
    );

    writeMemoryBufferByte(memoryBuffer, 0x19, 0x33);

    clearMemoryBuffer(memoryBuffer);

    expect(memoryBuffer.basePages.size).toBe(0);
    expect(memoryBuffer.workingPages.size).toBe(0);
    expect(getMemoryBufferPageCount(memoryBuffer)).toBe(0);
    expect(getMemoryBufferUsedByteCount(memoryBuffer)).toBe(0);
    expect(getMemoryBufferAddressRange(memoryBuffer)).toEqual({
      minAddress: null,
      maxAddress: null,
    });
    expect(memoryBuffer.pagePool.length).toBeGreaterThanOrEqual(2);
  });

  it('reloads the base image in place and reuses pooled page storage', () => {
    const memoryBuffer = createMemoryBuffer(
      {
        0x10: 0xaa,
        0x11: 0xbb,
      },
      0x10
    );

    const originalBasePage = memoryBuffer.basePages.get(0x1);

    writeMemoryBufferByte(memoryBuffer, 0x12, 0xcc);

    const originalWorkingPage = memoryBuffer.workingPages.get(0x1);
    const pooledByteArrays = [originalBasePage?.bytes, originalWorkingPage?.bytes].filter(
      (bytes): bytes is Uint8Array => bytes !== undefined
    );

    loadMemoryBufferBaseImage(memoryBuffer, {
      0x20: 0x44,
      0x21: 0x55,
    });

    const reloadedBasePage = memoryBuffer.basePages.get(0x2);

    expect(memoryBuffer.workingPages.size).toBe(0);
    expect(getMemoryBufferDirtyPageIndices(memoryBuffer)).toEqual([]);
    expect(readMemoryBufferByte(memoryBuffer, 0x10)).toBe(0x00);
    expect(readMemoryBufferByte(memoryBuffer, 0x20)).toBe(0x44);
    expect(readMemoryBufferByte(memoryBuffer, 0x21)).toBe(0x55);
    expect(pooledByteArrays).toContain(reloadedBasePage?.bytes);
  });

  it('can clone and restore a memory buffer without flattening it to an object map', () => {
    const source = createMemoryBuffer(
      {
        0x30: 0x01,
        0x31: 0x02,
      },
      0x10
    );

    writeMemoryBufferByte(source, 0x32, 0x03);

    const snapshot = cloneMemoryBuffer(source);
    const target = createMemoryBuffer(
      {
        0x40: 0xaa,
      },
      0x10
    );

    replaceMemoryBufferState(target, snapshot);

    expect(exportMemoryBufferMap(target)).toEqual(exportMemoryBufferMap(source));
    expect(target.basePages.get(0x3)).not.toBe(snapshot.basePages.get(0x3));
    expect(target.workingPages.get(0x3)).not.toBe(snapshot.workingPages.get(0x3));

    writeMemoryBufferByte(target, 0x33, 0x04);

    expect(readMemoryBufferByte(snapshot, 0x33)).toBe(0x00);
    expect(readMemoryBufferByte(target, 0x33)).toBe(0x04);
  });
});
