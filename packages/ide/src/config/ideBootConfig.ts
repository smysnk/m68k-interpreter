import type { FilesState } from '@/store/filesSlice';

const DEFAULT_PRELOAD_FILE = 'nibbles.asm';
const DEFAULT_AUTOPLAY = true;

export interface IdeBootConfig {
  preloadFile: string;
  autoPlay: boolean;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function getIdeBootConfig(): IdeBootConfig {
  return {
    preloadFile: process.env.NEXT_PUBLIC_IDE_PRELOAD_FILE?.trim() || DEFAULT_PRELOAD_FILE,
    autoPlay: parseBooleanEnv(process.env.NEXT_PUBLIC_IDE_AUTOPLAY, DEFAULT_AUTOPLAY),
  };
}

export function resolvePreloadedFileId(
  files: FilesState,
  preloadFile: string | undefined
): string | undefined {
  if (!preloadFile) {
    return undefined;
  }

  const normalizedTarget = preloadFile.trim().toLowerCase();
  if (!normalizedTarget) {
    return undefined;
  }

  const match = files.items.find((item) => {
    return [item.id, item.name, item.path].some(
      (candidate) => candidate.trim().toLowerCase() === normalizedTarget
    );
  });

  return match?.id;
}

