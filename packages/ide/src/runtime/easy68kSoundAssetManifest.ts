import {
  EASY68K_SOUND_MAX_ASSET_BYTES,
  EASY68K_SOUND_MAX_TOTAL_ASSET_BYTES,
  isValidEasy68kWav,
  normalizeEasy68kSoundPath,
  type Easy68kSoundAsset,
} from '@m68k/interpreter';

const STORAGE_KEY = 'm68k-interpreter.easy68k-sound-assets.v1';

interface PersistedAsset {
  id: string;
  path: string;
  base64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function loadPersistedEasy68kSoundAssets(): Easy68kSoundAsset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PersistedAsset[];
    let totalBytes = 0;
    const assets: Easy68kSoundAsset[] = [];
    for (const entry of parsed) {
      const path = normalizeEasy68kSoundPath(entry.path);
      const bytes = base64ToBytes(entry.base64);
      if (
        !path ||
        bytes.length > EASY68K_SOUND_MAX_ASSET_BYTES ||
        totalBytes + bytes.length > EASY68K_SOUND_MAX_TOTAL_ASSET_BYTES ||
        !isValidEasy68kWav(bytes)
      )
        continue;
      totalBytes += bytes.length;
      assets.push({ id: entry.id, path, bytes, mediaType: 'audio/wav' });
    }
    return assets;
  } catch {
    return [];
  }
}

export function persistEasy68kSoundAssets(assets: readonly Easy68kSoundAsset[]): void {
  if (typeof localStorage === 'undefined') return;
  const serialized: PersistedAsset[] = assets.map((asset) => ({
    id: asset.id,
    path: asset.path,
    base64: bytesToBase64(asset.bytes),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
}

export async function createEasy68kSoundAsset(file: File): Promise<Easy68kSoundAsset> {
  const path = normalizeEasy68kSoundPath(file.name);
  if (!path) throw new Error('Choose a WAV file with a project-relative filename.');
  if (file.size > EASY68K_SOUND_MAX_ASSET_BYTES) {
    throw new Error(
      `WAV files must be ${EASY68K_SOUND_MAX_ASSET_BYTES / 1024 / 1024} MB or smaller.`
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isValidEasy68kWav(bytes)) throw new Error('The selected file is not a valid WAV container.');
  return {
    id: `uploaded:${path}`,
    path,
    bytes,
    mediaType: 'audio/wav',
  };
}
