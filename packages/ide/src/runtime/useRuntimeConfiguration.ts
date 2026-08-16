import type {
  Easy68kHardwareDeviceConfig,
  EmulationConfig,
  UndoCaptureMode,
} from '@m68k/interpreter';
import type {
  RuntimeLoadRequest,
  WorkerExecutionConfig,
} from '@/runtime/worker/interpreterWorkerProtocol';

export function buildRuntimeLoadRequest(options: {
  source: string;
  emulation: EmulationConfig;
  columns: number;
  rows: number;
  hardwareDevices: readonly Easy68kHardwareDeviceConfig[];
  execution: WorkerExecutionConfig;
  undoMode?: UndoCaptureMode;
  undoCheckpointInterval?: number;
}): RuntimeLoadRequest {
  return {
    source: options.source,
    emulation: { ...options.emulation },
    terminal: { columns: options.columns, rows: options.rows },
    hardwareDevices: options.hardwareDevices.map((device) => ({ ...device })),
    execution: { ...options.execution },
    undo: {
      mode: options.undoMode ?? 'full',
      checkpointInterval: options.undoCheckpointInterval,
    },
  };
}
