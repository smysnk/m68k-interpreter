/**
 * Memory management for the M68K emulator.
 *
 * Internally this now uses the shared paged bytearray memory buffer so the
 * runtime can reuse backing storage instead of rebuilding large object maps.
 */

import { CODE_LONG, CODE_WORD, CODE_BYTE } from './operations';
import {
  captureMemoryBufferUndoPageEntry,
  clearMemoryBuffer,
  clearMemoryBufferDirtyPages,
  cloneMemoryBuffer,
  createMemoryBuffer,
  exportMemoryBufferMap,
  getMemoryBufferAddressRange,
  getMemoryBufferDirtyPageIndices,
  getMemoryBufferUsedByteCount,
  loadMemoryBufferBaseImage,
  readMemoryBufferByte,
  readMemoryBufferRange,
  restoreMemoryBufferUndoPageEntries,
  replaceMemoryBufferState,
  writeMemoryBufferByte,
  type MemoryBuffer,
  type MemoryBufferAddressRange,
  type MemoryBufferUndoPageEntry,
} from './memoryBuffer';

export type MemorySnapshot = MemoryBuffer;
export type MemoryUndoPageEntry = MemoryBufferUndoPageEntry;

const MAX_ADDRESS = 0x7fffffff;

export class Memory {
  private readonly memoryBuffer: MemoryBuffer;

  constructor(initialMemory: Record<number, number> = {}) {
    this.memoryBuffer = createMemoryBuffer(initialMemory);
  }

  /**
   * Get entire memory map.
   *
   * This is intentionally an expensive debug/export helper.
   */
  getMemory(): Record<number, number> {
    return exportMemoryBufferMap(this.memoryBuffer);
  }

  /**
   * Replace the current base memory image.
   */
  setMemory(memoryMap: Record<number, number>): void {
    loadMemoryBufferBaseImage(this.memoryBuffer, memoryMap);
  }

  /**
   * Create a deep snapshot suitable for undo storage.
   */
  createSnapshot(): MemorySnapshot {
    return cloneMemoryBuffer(this.memoryBuffer);
  }

  /**
   * Restore a previously captured memory snapshot.
   */
  restoreSnapshot(snapshot: MemorySnapshot): void {
    replaceMemoryBufferState(this.memoryBuffer, snapshot);
  }

  captureUndoPage(pageIndex: number): MemoryUndoPageEntry {
    return captureMemoryBufferUndoPageEntry(this.memoryBuffer, pageIndex);
  }

  restoreUndoPages(entries: MemoryUndoPageEntry[]): void {
    restoreMemoryBufferUndoPageEntries(this.memoryBuffer, entries);
  }

  /**
   * Get a single byte from memory.
   */
  getByte(address: number): number {
    return readMemoryBufferByte(this.memoryBuffer, address);
  }

  /**
   * Get a word (2 bytes) from memory.
   */
  getWord(address: number): number {
    const firstByte = this.getByte(address);

    if (!this.isValidAddress(address + 1)) return 0x0000;

    const secondByte = this.getByte(address + 1);
    return (((firstByte << 8) | secondByte) & 0xffff) >>> 0;
  }

  /**
   * Get a long-word (4 bytes) from memory.
   */
  getLong(address: number): number {
    const byte0 = this.getByte(address);
    if (!this.isValidAddress(address + 1)) return 0;

    const byte1 = this.getByte(address + 1);
    if (!this.isValidAddress(address + 2)) return 0;

    const byte2 = this.getByte(address + 2);
    if (!this.isValidAddress(address + 3)) return 0;

    const byte3 = this.getByte(address + 3);
    return (((byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3) >>> 0);
  }

  /**
   * Set a single byte in memory.
   */
  setByte(address: number, value: number): void {
    writeMemoryBufferByte(this.memoryBuffer, address, (value & 0xff) >>> 0);
  }

  /**
   * Set a word (2 bytes) in memory.
   */
  setWord(address: number, value: number): void {
    address = address >>> 0;
    this.setByte(address + 0, (value >>> 8) & 0xff);
    this.setByte(address + 1, value & 0xff);
  }

  /**
   * Set a long-word (4 bytes) in memory.
   */
  setLong(address: number, value: number): void {
    address = address >>> 0;
    this.setByte(address + 0, (value >>> 24) & 0xff);
    this.setByte(address + 1, (value >>> 16) & 0xff);
    this.setByte(address + 2, (value >>> 8) & 0xff);
    this.setByte(address + 3, value & 0xff);
  }

  /**
   * Set value in memory based on size code.
   */
  set(address: number, value: number, size: number): void {
    switch (size) {
      case CODE_LONG:
        this.setLong(address, value);
        break;
      case CODE_WORD:
        this.setWord(address, value);
        break;
      case CODE_BYTE:
        this.setByte(address, value);
        break;
    }
  }

  /**
   * Read a byte range from memory.
   */
  readRange(address: number, length: number): Uint8Array {
    return readMemoryBufferRange(this.memoryBuffer, address, length);
  }

  /**
   * Get the current memory version.
   */
  getMemoryVersion(): number {
    return this.memoryBuffer.version;
  }

  getPageSize(): number {
    return this.memoryBuffer.pageSize;
  }

  /**
   * Get the dirty page indices since the last clear.
   */
  getDirtyPages(): number[] {
    return getMemoryBufferDirtyPageIndices(this.memoryBuffer);
  }

  /**
   * Clear dirty page markers.
   */
  clearDirtyPages(): void {
    clearMemoryBufferDirtyPages(this.memoryBuffer);
  }

  /**
   * Get the byte count currently defined in memory.
   */
  getUsedBytes(): number {
    return getMemoryBufferUsedByteCount(this.memoryBuffer);
  }

  /**
   * Get the address range currently defined in memory.
   */
  getAddressRange(): MemoryBufferAddressRange {
    return getMemoryBufferAddressRange(this.memoryBuffer);
  }

  /**
   * Check if address is valid.
   */
  isValidAddress(address: number): boolean {
    address = address >>> 0;
    return 0 <= address && address <= MAX_ADDRESS;
  }

  /**
   * Clear all memory and release all pages back to the pool.
   */
  clear(): void {
    clearMemoryBuffer(this.memoryBuffer);
  }

  /**
   * Get number of used memory addresses.
   */
  getUsedSize(): number {
    return this.getUsedBytes();
  }
}
