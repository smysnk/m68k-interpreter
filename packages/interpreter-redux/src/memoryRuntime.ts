import {
  CODE_BYTE,
  CODE_LONG,
  CODE_WORD,
  Memory,
  type MemorySnapshot,
  type MemoryUndoPageEntry,
} from '@m68k/interpreter';
import { createMemoryState, type MemoryState } from './state';

export type MemorySizeCode = typeof CODE_BYTE | typeof CODE_WORD | typeof CODE_LONG;

export class ReducerMemoryRuntime {
  private readonly memory: Memory;
  private activeUndoJournal: Map<number, MemoryUndoPageEntry> | null = null;

  constructor(initialMemory: Record<number, number> = {}) {
    this.memory = new Memory(initialMemory);
  }

  reset(initialMemory: Record<number, number> = {}): void {
    this.memory.setMemory(initialMemory);
  }

  createSnapshot(): MemorySnapshot {
    return this.memory.createSnapshot();
  }

  restoreSnapshot(snapshot: MemorySnapshot): void {
    this.memory.restoreSnapshot(snapshot);
  }

  beginUndoJournal(): void {
    this.activeUndoJournal = new Map<number, MemoryUndoPageEntry>();
    this.memory.clearDirtyPages();
  }

  finishUndoJournal(): MemoryUndoPageEntry[] {
    const journal = this.activeUndoJournal;
    this.activeUndoJournal = null;
    this.memory.clearDirtyPages();
    return journal ? [...journal.values()] : [];
  }

  cancelUndoJournal(): void {
    this.activeUndoJournal = null;
    this.memory.clearDirtyPages();
  }

  restoreUndoJournal(entries: MemoryUndoPageEntry[]): void {
    this.memory.restoreUndoPages(entries);
    this.memory.clearDirtyPages();
  }

  readByte(address: number): number {
    return this.memory.getByte(address);
  }

  readWord(address: number): number {
    return this.memory.getWord(address);
  }

  readLong(address: number): number {
    return this.memory.getLong(address);
  }

  readValue(address: number, size: MemorySizeCode): number {
    switch (size) {
      case CODE_BYTE:
        return this.readByte(address);
      case CODE_WORD:
        return this.readWord(address);
      case CODE_LONG:
      default:
        return this.readLong(address);
    }
  }

  writeByte(address: number, value: number): void {
    this.recordUndoPages(address, 1);
    this.memory.setByte(address, value);
  }

  writeWord(address: number, value: number): void {
    this.recordUndoPages(address, 2);
    this.memory.setWord(address, value);
  }

  writeLong(address: number, value: number): void {
    this.recordUndoPages(address, 4);
    this.memory.setLong(address, value);
  }

  writeValue(address: number, value: number, size: MemorySizeCode): void {
    switch (size) {
      case CODE_BYTE:
        this.writeByte(address, value);
        return;
      case CODE_WORD:
        this.writeWord(address, value);
        return;
      case CODE_LONG:
      default:
        this.writeLong(address, value);
        return;
    }
  }

  exportMemory(): Record<number, number> {
    return this.memory.getMemory();
  }

  readRange(address: number, length: number): Uint8Array {
    return this.memory.readRange(address, length);
  }

  toMemoryState(): MemoryState {
    const addressRange = this.memory.getAddressRange();
    return createMemoryState({
      usedBytes: this.memory.getUsedBytes(),
      minAddress: addressRange.minAddress,
      maxAddress: addressRange.maxAddress,
      version: this.memory.getMemoryVersion(),
    });
  }

  private recordUndoPages(address: number, byteLength: number): void {
    if (this.activeUndoJournal === null || byteLength <= 0) {
      return;
    }

    const pageSize = this.memory.getPageSize();
    const startPageIndex = Math.floor((address >>> 0) / pageSize);
    const endPageIndex = Math.floor((((address >>> 0) + byteLength - 1) >>> 0) / pageSize);

    for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
      if (!this.activeUndoJournal.has(pageIndex)) {
        this.activeUndoJournal.set(pageIndex, this.memory.captureUndoPage(pageIndex));
      }
    }
  }
}
