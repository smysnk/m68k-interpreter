import { describe, expect, it } from 'vitest';
import { Memory } from './memory';

describe('Memory', () => {
  it('stores bytes in the shared paged buffer and reports lightweight metadata', () => {
    const memory = new Memory({
      0x1000: 0x4e,
      0x1001: 0x75,
      0x2000: 0x00,
    });

    expect(memory.getByte(0x1000)).toBe(0x4e);
    expect(memory.getWord(0x1000)).toBe(0x4e75);
    expect(memory.getByte(0x2000)).toBe(0x00);
    expect(memory.getUsedBytes()).toBe(3);
    expect(memory.getAddressRange()).toEqual({
      minAddress: 0x1000,
      maxAddress: 0x2000,
    });
    expect(memory.getDirtyPages()).toEqual([]);

    memory.setByte(0x1002, 0xaa);

    expect(memory.getByte(0x1002)).toBe(0xaa);
    expect(memory.getUsedSize()).toBe(4);
    expect(memory.getDirtyPages()).toEqual([1]);
    expect(Array.from(memory.readRange(0x1000, 4))).toEqual([0x4e, 0x75, 0xaa, 0x00]);
  });

  it('restores undo snapshots without routing through exported memory maps', () => {
    const memory = new Memory({
      0x40: 0x11,
      0x41: 0x22,
    });

    const snapshot = memory.createSnapshot();
    const versionBeforeMutation = memory.getMemoryVersion();

    memory.setLong(0x40, 0xaabbccdd);

    expect(memory.getLong(0x40)).toBe(0xaabbccdd >>> 0);
    expect(memory.getMemoryVersion()).toBeGreaterThan(versionBeforeMutation);

    memory.restoreSnapshot(snapshot);

    expect(memory.getByte(0x40)).toBe(0x11);
    expect(memory.getByte(0x41)).toBe(0x22);
    expect(memory.getByte(0x42)).toBe(0x00);
    expect(memory.getByte(0x43)).toBe(0x00);
  });

  it('restores compact undo page journals without cloning the full memory buffer', () => {
    const memory = new Memory({
      0x1000: 0x4e,
      0x1001: 0x75,
    });

    const basePageUndo = memory.captureUndoPage(0x1);
    memory.setByte(0x1002, 0xaa);

    expect(memory.getByte(0x1002)).toBe(0xaa);

    memory.restoreUndoPages([basePageUndo]);

    expect(memory.getByte(0x1000)).toBe(0x4e);
    expect(memory.getByte(0x1001)).toBe(0x75);
    expect(memory.getByte(0x1002)).toBe(0x00);

    memory.setByte(0x1002, 0xaa);
    const workingPageUndo = memory.captureUndoPage(0x1);
    memory.setByte(0x1000, 0x99);

    expect(memory.getByte(0x1000)).toBe(0x99);
    expect(memory.getByte(0x1002)).toBe(0xaa);

    memory.restoreUndoPages([workingPageUndo]);

    expect(memory.getByte(0x1000)).toBe(0x4e);
    expect(memory.getByte(0x1001)).toBe(0x75);
    expect(memory.getByte(0x1002)).toBe(0xaa);
  });

  it('reloads the base memory image and reuses pooled page storage where possible', () => {
    const memory = new Memory({
      0x10: 0xaa,
      0x11: 0xbb,
    });

    memory.setByte(0x12, 0xcc);
    memory.setMemory({
      0x20: 0x44,
      0x21: 0x55,
    });

    expect(memory.getByte(0x10)).toBe(0x00);
    expect(memory.getByte(0x20)).toBe(0x44);
    expect(memory.getByte(0x21)).toBe(0x55);
    expect(memory.getUsedBytes()).toBe(2);
    expect(memory.getDirtyPages()).toEqual([]);
  });
});
