import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultFilesState, NIBBLES_FILE_ID, SCRATCH_FILE_ID } from '@/store/filesSlice';
import { getIdeBootConfig, resolvePreloadedFileId } from '@/config/ideBootConfig';

describe('ideBootConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to preloading nibbles and auto-play enabled', () => {
    vi.unstubAllEnvs();

    expect(getIdeBootConfig()).toEqual({
      preloadFile: 'nibbles.asm',
      autoPlay: true,
    });
  });

  it('resolves preloaded files by id, file name, or path', () => {
    const files = createDefaultFilesState();

    expect(resolvePreloadedFileId(files, NIBBLES_FILE_ID)).toBe(NIBBLES_FILE_ID);
    expect(resolvePreloadedFileId(files, 'nibbles.asm')).toBe(NIBBLES_FILE_ID);
    expect(resolvePreloadedFileId(files, 'fixtures/nibbles.asm')).toBe(NIBBLES_FILE_ID);
    expect(resolvePreloadedFileId(files, 'examples/nibbles.asm')).toBe(NIBBLES_FILE_ID);
    expect(resolvePreloadedFileId(files, SCRATCH_FILE_ID)).toBe(SCRATCH_FILE_ID);
  });

  it('reads explicit env overrides', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_PRELOAD_FILE', 'workspace/scratch.asm');
    vi.stubEnv('NEXT_PUBLIC_IDE_AUTOPLAY', 'false');

    const files = createDefaultFilesState();

    expect(getIdeBootConfig()).toEqual({
      preloadFile: 'workspace/scratch.asm',
      autoPlay: false,
    });
    expect(resolvePreloadedFileId(files, getIdeBootConfig().preloadFile)).toBe(SCRATCH_FILE_ID);
  });
});
