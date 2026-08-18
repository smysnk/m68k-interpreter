import type {
  Easy68kHardwareDeviceConfig,
  Easy68kSoundAsset,
  EmulationConfig,
  UndoCaptureMode,
} from '@m68k/interpreter';
import type {
  RuntimeLoadRequest,
  WorkerExecutionConfig,
} from '@/runtime/worker/interpreterWorkerProtocol';
import { DEFAULT_EASY68K_SOUND_ASSETS } from '@/runtime/defaultSoundAssets';
import { loadPersistedEasy68kSoundAssets } from '@/runtime/easy68kSoundAssetManifest';

export function buildRuntimeLoadRequest(options: {
  source: string;
  emulation: EmulationConfig;
  columns: number;
  rows: number;
  hardwareDevices: readonly Easy68kHardwareDeviceConfig[];
  soundAssets?: readonly Easy68kSoundAsset[];
  execution: WorkerExecutionConfig;
  undoMode?: UndoCaptureMode;
  undoCheckpointInterval?: number;
}): RuntimeLoadRequest {
  const soundAssets =
    options.soundAssets ??
    (options.emulation.machineProfile === 'easy68k'
      ? [...DEFAULT_EASY68K_SOUND_ASSETS, ...loadPersistedEasy68kSoundAssets()]
      : []);
  return {
    source: options.source,
    emulation: { ...options.emulation },
    terminal: { columns: options.columns, rows: options.rows },
    hardwareDevices: options.hardwareDevices.map((device) => ({ ...device })),
    soundAssets: soundAssets.map((asset) => ({
      ...asset,
      bytes: new Uint8Array(asset.bytes),
    })),
    execution: { ...options.execution },
    undo: {
      mode: options.undoMode ?? 'full',
      checkpointInterval: options.undoCheckpointInterval,
    },
  };
}
