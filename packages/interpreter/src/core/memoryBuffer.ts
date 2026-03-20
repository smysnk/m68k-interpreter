export const DEFAULT_MEMORY_BUFFER_PAGE_SIZE = 0x1000;
export const MAX_MEMORY_BUFFER_ADDRESS = 0x7fffffff;

export interface MemoryBufferPage {
  pageIndex: number;
  bytes: Uint8Array;
  definedMask: Uint8Array;
  definedByteCount: number;
}

export interface MemoryBufferAddressRange {
  minAddress: number | null;
  maxAddress: number | null;
}

export interface MemoryBuffer {
  pageSize: number;
  version: number;
  basePages: Map<number, MemoryBufferPage>;
  workingPages: Map<number, MemoryBufferPage>;
  pagePool: MemoryBufferPage[];
  dirtyPageIndices: Set<number>;
}

export interface MemoryBufferUndoPageEntry {
  pageIndex: number;
  previousWorkingPage: MemoryBufferPage | null;
}

function normalizePageSize(pageSize: number): number {
  return Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : DEFAULT_MEMORY_BUFFER_PAGE_SIZE;
}

function normalizeAddress(address: number): number {
  return address >>> 0;
}

function assertValidAddress(address: number): number {
  const normalizedAddress = normalizeAddress(address);

  if (normalizedAddress > MAX_MEMORY_BUFFER_ADDRESS) {
    throw new RangeError(
      `Memory buffer address ${normalizedAddress.toString(16)} exceeds ${MAX_MEMORY_BUFFER_ADDRESS.toString(16)}`
    );
  }

  return normalizedAddress;
}

function assertValidLength(length: number): number {
  if (!Number.isFinite(length) || length < 0) {
    throw new RangeError(`Memory buffer length ${length} must be a non-negative finite number`);
  }

  return Math.floor(length);
}

function getPageIndex(pageSize: number, address: number): number {
  return Math.floor(address / pageSize);
}

function getPageOffset(pageSize: number, address: number): number {
  return address % pageSize;
}

function getDefinedMaskLength(pageSize: number): number {
  return Math.ceil(pageSize / 8);
}

function createMemoryBufferPageStorage(pageSize: number): MemoryBufferPage {
  return {
    pageIndex: -1,
    bytes: new Uint8Array(pageSize),
    definedMask: new Uint8Array(getDefinedMaskLength(pageSize)),
    definedByteCount: 0,
  };
}

function clearMemoryBufferPage(page: MemoryBufferPage): MemoryBufferPage {
  page.pageIndex = -1;
  page.bytes.fill(0);
  page.definedMask.fill(0);
  page.definedByteCount = 0;
  return page;
}

function isPageOffsetDefined(page: MemoryBufferPage, pageOffset: number): boolean {
  const maskIndex = pageOffset >> 3;
  const maskBit = 1 << (pageOffset & 7);
  return (page.definedMask[maskIndex] & maskBit) !== 0;
}

function setPageOffsetDefined(
  page: MemoryBufferPage,
  pageOffset: number
): boolean {
  const maskIndex = pageOffset >> 3;
  const maskBit = 1 << (pageOffset & 7);

  if ((page.definedMask[maskIndex] & maskBit) !== 0) {
    return false;
  }

  page.definedMask[maskIndex] |= maskBit;
  page.definedByteCount += 1;
  return true;
}

function assignPageAddress(
  page: MemoryBufferPage,
  pageIndex: number
): MemoryBufferPage {
  page.pageIndex = pageIndex;
  return page;
}

function acquirePage(
  memoryBuffer: MemoryBuffer,
  pageIndex: number
): MemoryBufferPage {
  const page = memoryBuffer.pagePool.pop() ?? createMemoryBufferPageStorage(memoryBuffer.pageSize);
  clearMemoryBufferPage(page);
  return assignPageAddress(page, pageIndex);
}

function releasePage(
  memoryBuffer: MemoryBuffer,
  page: MemoryBufferPage
): void {
  memoryBuffer.pagePool.push(clearMemoryBufferPage(page));
}

function clonePageIntoWorkingCopy(
  memoryBuffer: MemoryBuffer,
  sourcePage: MemoryBufferPage | undefined,
  pageIndex: number
): MemoryBufferPage {
  const page = acquirePage(memoryBuffer, pageIndex);

  if (sourcePage) {
    page.bytes.set(sourcePage.bytes);
    page.definedMask.set(sourcePage.definedMask);
    page.definedByteCount = sourcePage.definedByteCount;
  }

  return page;
}

function getCurrentPage(
  memoryBuffer: MemoryBuffer,
  pageIndex: number
): MemoryBufferPage | undefined {
  return memoryBuffer.workingPages.get(pageIndex) ?? memoryBuffer.basePages.get(pageIndex);
}

function getOrCreateWorkingPage(
  memoryBuffer: MemoryBuffer,
  pageIndex: number
): MemoryBufferPage {
  const existingWorkingPage = memoryBuffer.workingPages.get(pageIndex);

  if (existingWorkingPage) {
    return existingWorkingPage;
  }

  const workingPage = clonePageIntoWorkingCopy(
    memoryBuffer,
    memoryBuffer.basePages.get(pageIndex),
    pageIndex
  );
  memoryBuffer.workingPages.set(pageIndex, workingPage);
  return workingPage;
}

function setBaseByte(
  memoryBuffer: MemoryBuffer,
  address: number,
  value: number
): void {
  const pageIndex = getPageIndex(memoryBuffer.pageSize, address);
  const pageOffset = getPageOffset(memoryBuffer.pageSize, address);
  let page = memoryBuffer.basePages.get(pageIndex);

  if (!page) {
    page = acquirePage(memoryBuffer, pageIndex);
    memoryBuffer.basePages.set(pageIndex, page);
  }

  page.bytes[pageOffset] = value & 0xff;
  setPageOffsetDefined(page, pageOffset);
}

function listCurrentPages(
  memoryBuffer: MemoryBuffer
): MemoryBufferPage[] {
  const pages: MemoryBufferPage[] = [];

  for (const [pageIndex, page] of memoryBuffer.basePages) {
    if (!memoryBuffer.workingPages.has(pageIndex)) {
      pages.push(page);
    }
  }

  for (const page of memoryBuffer.workingPages.values()) {
    pages.push(page);
  }

  pages.sort((left, right) => left.pageIndex - right.pageIndex);
  return pages;
}

function clonePage(
  page: MemoryBufferPage,
  pageSize: number
): MemoryBufferPage {
  const pageClone = createMemoryBufferPageStorage(pageSize);
  pageClone.pageIndex = page.pageIndex;
  pageClone.bytes.set(page.bytes);
  pageClone.definedMask.set(page.definedMask);
  pageClone.definedByteCount = page.definedByteCount;
  return pageClone;
}

function forEachDefinedByte(
  page: MemoryBufferPage,
  visitor: (pageOffset: number) => void
): void {
  for (let pageOffset = 0; pageOffset < page.bytes.length; pageOffset += 1) {
    if (isPageOffsetDefined(page, pageOffset)) {
      visitor(pageOffset);
    }
  }
}

export function createMemoryBuffer(
  initialBytes: Record<number, number> = {},
  pageSize = DEFAULT_MEMORY_BUFFER_PAGE_SIZE
): MemoryBuffer {
  const memoryBuffer: MemoryBuffer = {
    pageSize: normalizePageSize(pageSize),
    version: 1,
    basePages: new Map<number, MemoryBufferPage>(),
    workingPages: new Map<number, MemoryBufferPage>(),
    pagePool: [],
    dirtyPageIndices: new Set<number>(),
  };

  for (const [addressKey, value] of Object.entries(initialBytes)) {
    setBaseByte(memoryBuffer, assertValidAddress(Number(addressKey)), value);
  }

  return memoryBuffer;
}

export function readMemoryBufferByte(
  memoryBuffer: MemoryBuffer,
  address: number
): number {
  const normalizedAddress = assertValidAddress(address);
  const pageIndex = getPageIndex(memoryBuffer.pageSize, normalizedAddress);
  const page = getCurrentPage(memoryBuffer, pageIndex);

  if (!page) {
    return 0x00;
  }

  const pageOffset = getPageOffset(memoryBuffer.pageSize, normalizedAddress);
  return isPageOffsetDefined(page, pageOffset) ? page.bytes[pageOffset] : 0x00;
}

export function writeMemoryBufferByte(
  memoryBuffer: MemoryBuffer,
  address: number,
  value: number
): MemoryBuffer {
  const normalizedAddress = assertValidAddress(address);
  const normalizedValue = value & 0xff;
  const pageIndex = getPageIndex(memoryBuffer.pageSize, normalizedAddress);
  const pageOffset = getPageOffset(memoryBuffer.pageSize, normalizedAddress);
  const currentPage = getCurrentPage(memoryBuffer, pageIndex);
  const currentDefined = currentPage ? isPageOffsetDefined(currentPage, pageOffset) : false;
  const currentValue = currentDefined && currentPage ? currentPage.bytes[pageOffset] : 0x00;

  if (currentDefined && currentValue === normalizedValue) {
    return memoryBuffer;
  }

  const workingPage = getOrCreateWorkingPage(memoryBuffer, pageIndex);
  workingPage.bytes[pageOffset] = normalizedValue;
  setPageOffsetDefined(workingPage, pageOffset);
  memoryBuffer.dirtyPageIndices.add(pageIndex);
  memoryBuffer.version += 1;

  return memoryBuffer;
}

export function writeMemoryBufferRange(
  memoryBuffer: MemoryBuffer,
  startAddress: number,
  values: ArrayLike<number>
): MemoryBuffer {
  const normalizedStartAddress = assertValidAddress(startAddress);

  for (let index = 0; index < values.length; index += 1) {
    writeMemoryBufferByte(memoryBuffer, normalizedStartAddress + index, values[index] ?? 0);
  }

  return memoryBuffer;
}

export function readMemoryBufferRange(
  memoryBuffer: MemoryBuffer,
  startAddress: number,
  length: number
): Uint8Array {
  const normalizedStartAddress = assertValidAddress(startAddress);
  const normalizedLength = assertValidLength(length);

  if (normalizedLength === 0) {
    return new Uint8Array(0);
  }

  const endAddress = normalizedStartAddress + normalizedLength - 1;
  assertValidAddress(endAddress);

  const bytes = new Uint8Array(normalizedLength);

  for (let index = 0; index < normalizedLength; index += 1) {
    bytes[index] = readMemoryBufferByte(memoryBuffer, normalizedStartAddress + index);
  }

  return bytes;
}

export function getMemoryBufferDirtyPageIndices(
  memoryBuffer: MemoryBuffer
): number[] {
  return [...memoryBuffer.dirtyPageIndices].sort((left, right) => left - right);
}

export function clearMemoryBufferDirtyPages(
  memoryBuffer: MemoryBuffer
): MemoryBuffer {
  memoryBuffer.dirtyPageIndices.clear();
  return memoryBuffer;
}

export function resetMemoryBuffer(
  memoryBuffer: MemoryBuffer
): MemoryBuffer {
  if (memoryBuffer.workingPages.size === 0 && memoryBuffer.dirtyPageIndices.size === 0) {
    return memoryBuffer;
  }

  for (const page of memoryBuffer.workingPages.values()) {
    releasePage(memoryBuffer, page);
  }

  memoryBuffer.workingPages.clear();
  memoryBuffer.dirtyPageIndices.clear();
  memoryBuffer.version += 1;

  return memoryBuffer;
}

export function clearMemoryBuffer(
  memoryBuffer: MemoryBuffer
): MemoryBuffer {
  if (memoryBuffer.basePages.size === 0 && memoryBuffer.workingPages.size === 0) {
    return memoryBuffer;
  }

  for (const page of memoryBuffer.basePages.values()) {
    releasePage(memoryBuffer, page);
  }

  for (const page of memoryBuffer.workingPages.values()) {
    releasePage(memoryBuffer, page);
  }

  memoryBuffer.basePages.clear();
  memoryBuffer.workingPages.clear();
  memoryBuffer.dirtyPageIndices.clear();
  memoryBuffer.version += 1;

  return memoryBuffer;
}

export function loadMemoryBufferBaseImage(
  memoryBuffer: MemoryBuffer,
  initialBytes: Record<number, number> = {}
): MemoryBuffer {
  const normalizedEntries = Object.entries(initialBytes).map(([addressKey, value]) => [
    assertValidAddress(Number(addressKey)),
    value & 0xff,
  ] as const);

  for (const page of memoryBuffer.basePages.values()) {
    releasePage(memoryBuffer, page);
  }

  for (const page of memoryBuffer.workingPages.values()) {
    releasePage(memoryBuffer, page);
  }

  memoryBuffer.basePages.clear();
  memoryBuffer.workingPages.clear();
  memoryBuffer.dirtyPageIndices.clear();

  for (const [address, value] of normalizedEntries) {
    setBaseByte(memoryBuffer, address, value);
  }

  memoryBuffer.version += 1;

  return memoryBuffer;
}

export function cloneMemoryBuffer(
  memoryBuffer: MemoryBuffer
): MemoryBuffer {
  const memoryBufferClone: MemoryBuffer = {
    pageSize: memoryBuffer.pageSize,
    version: memoryBuffer.version,
    basePages: new Map<number, MemoryBufferPage>(),
    workingPages: new Map<number, MemoryBufferPage>(),
    pagePool: [],
    dirtyPageIndices: new Set<number>(memoryBuffer.dirtyPageIndices),
  };

  for (const [pageIndex, page] of memoryBuffer.basePages) {
    memoryBufferClone.basePages.set(pageIndex, clonePage(page, memoryBuffer.pageSize));
  }

  for (const [pageIndex, page] of memoryBuffer.workingPages) {
    memoryBufferClone.workingPages.set(pageIndex, clonePage(page, memoryBuffer.pageSize));
  }

  return memoryBufferClone;
}

export function replaceMemoryBufferState(
  target: MemoryBuffer,
  source: MemoryBuffer
): MemoryBuffer {
  const canReusePooledPages = target.pageSize === source.pageSize;

  for (const page of target.basePages.values()) {
    if (canReusePooledPages) {
      releasePage(target, page);
    }
  }

  for (const page of target.workingPages.values()) {
    if (canReusePooledPages) {
      releasePage(target, page);
    }
  }

  if (!canReusePooledPages) {
    target.pagePool = [];
    target.pageSize = source.pageSize;
  }

  target.basePages.clear();
  target.workingPages.clear();
  target.version = source.version;
  target.dirtyPageIndices = new Set<number>(source.dirtyPageIndices);

  for (const [pageIndex, page] of source.basePages) {
    const pageClone = acquirePage(target, pageIndex);
    pageClone.bytes.set(page.bytes);
    pageClone.definedMask.set(page.definedMask);
    pageClone.definedByteCount = page.definedByteCount;
    target.basePages.set(pageIndex, pageClone);
  }

  for (const [pageIndex, page] of source.workingPages) {
    const pageClone = acquirePage(target, pageIndex);
    pageClone.bytes.set(page.bytes);
    pageClone.definedMask.set(page.definedMask);
    pageClone.definedByteCount = page.definedByteCount;
    target.workingPages.set(pageIndex, pageClone);
  }

  return target;
}

export function captureMemoryBufferUndoPageEntry(
  memoryBuffer: MemoryBuffer,
  pageIndex: number
): MemoryBufferUndoPageEntry {
  const existingWorkingPage = memoryBuffer.workingPages.get(pageIndex);

  return {
    pageIndex,
    previousWorkingPage:
      existingWorkingPage === undefined ? null : clonePage(existingWorkingPage, memoryBuffer.pageSize),
  };
}

export function restoreMemoryBufferUndoPageEntries(
  memoryBuffer: MemoryBuffer,
  entries: MemoryBufferUndoPageEntry[]
): MemoryBuffer {
  let restoredAnyPage = false;

  for (const entry of entries) {
    const existingWorkingPage = memoryBuffer.workingPages.get(entry.pageIndex);
    if (existingWorkingPage) {
      releasePage(memoryBuffer, existingWorkingPage);
      memoryBuffer.workingPages.delete(entry.pageIndex);
      restoredAnyPage = true;
    }

    if (entry.previousWorkingPage) {
      const restoredPage = acquirePage(memoryBuffer, entry.pageIndex);
      restoredPage.bytes.set(entry.previousWorkingPage.bytes);
      restoredPage.definedMask.set(entry.previousWorkingPage.definedMask);
      restoredPage.definedByteCount = entry.previousWorkingPage.definedByteCount;
      memoryBuffer.workingPages.set(entry.pageIndex, restoredPage);
      restoredAnyPage = true;
    }

    memoryBuffer.dirtyPageIndices.delete(entry.pageIndex);
  }

  if (restoredAnyPage) {
    memoryBuffer.version += 1;
  }

  return memoryBuffer;
}

export function exportMemoryBufferMap(
  memoryBuffer: MemoryBuffer
): Record<number, number> {
  const exportedBytes: Record<number, number> = {};

  for (const page of listCurrentPages(memoryBuffer)) {
    const pageBaseAddress = page.pageIndex * memoryBuffer.pageSize;

    forEachDefinedByte(page, (pageOffset) => {
      exportedBytes[pageBaseAddress + pageOffset] = page.bytes[pageOffset];
    });
  }

  return exportedBytes;
}

export function getMemoryBufferUsedByteCount(
  memoryBuffer: MemoryBuffer
): number {
  let usedByteCount = 0;

  for (const page of listCurrentPages(memoryBuffer)) {
    usedByteCount += page.definedByteCount;
  }

  return usedByteCount;
}

export function getMemoryBufferAddressRange(
  memoryBuffer: MemoryBuffer
): MemoryBufferAddressRange {
  let minAddress: number | null = null;
  let maxAddress: number | null = null;

  for (const page of listCurrentPages(memoryBuffer)) {
    const pageBaseAddress = page.pageIndex * memoryBuffer.pageSize;

    forEachDefinedByte(page, (pageOffset) => {
      const address = pageBaseAddress + pageOffset;

      if (minAddress === null || address < minAddress) {
        minAddress = address;
      }

      if (maxAddress === null || address > maxAddress) {
        maxAddress = address;
      }
    });
  }

  return { minAddress, maxAddress };
}

export function getMemoryBufferPageCount(
  memoryBuffer: MemoryBuffer
): number {
  let pageCount = memoryBuffer.workingPages.size;

  for (const pageIndex of memoryBuffer.basePages.keys()) {
    if (!memoryBuffer.workingPages.has(pageIndex)) {
      pageCount += 1;
    }
  }

  return pageCount;
}
