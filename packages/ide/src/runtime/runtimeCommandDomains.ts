import { runtimeCommandPort, type RuntimeCommandPort } from './runtimeCommandPort';

type BoundPort<Method extends keyof RuntimeCommandPort> = {
  [Key in Method]: RuntimeCommandPort[Key];
};

function bindMethod<Key extends keyof RuntimeCommandPort>(key: Key): RuntimeCommandPort[Key] {
  return runtimeCommandPort[key].bind(runtimeCommandPort) as RuntimeCommandPort[Key];
}

export type RuntimeLifecycleCommandPort = BoundPort<'initialize' | 'loadProgram' | 'reset'>;

export const runtimeLifecycleCommandPort: RuntimeLifecycleCommandPort = {
  initialize: bindMethod('initialize'),
  loadProgram: bindMethod('loadProgram'),
  reset: bindMethod('reset'),
};

export type RuntimeExecutionCommandPort = BoundPort<
  | 'run'
  | 'resume'
  | 'pause'
  | 'pulse'
  | 'configureExecution'
  | 'step'
  | 'undo'
  | 'setUndoCaptureMode'
>;

export const runtimeExecutionCommandPort: RuntimeExecutionCommandPort = {
  run: bindMethod('run'),
  resume: bindMethod('resume'),
  pause: bindMethod('pause'),
  pulse: bindMethod('pulse'),
  configureExecution: bindMethod('configureExecution'),
  step: bindMethod('step'),
  undo: bindMethod('undo'),
  setUndoCaptureMode: bindMethod('setUndoCaptureMode'),
};

export type RuntimeDebuggerCommandPort = BoundPort<
  'configureDebugger' | 'stepOver' | 'stepOut' | 'runToAddress'
>;

export const runtimeDebuggerCommandPort: RuntimeDebuggerCommandPort = {
  configureDebugger: bindMethod('configureDebugger'),
  stepOver: bindMethod('stepOver'),
  stepOut: bindMethod('stepOut'),
  runToAddress: bindMethod('runToAddress'),
};

export type RuntimeDeviceCommandPort = BoundPort<
  'configureAutomaticInterrupts' | 'stopCompletedSoundVoice'
>;

export const runtimeDeviceCommandPort: RuntimeDeviceCommandPort = {
  configureAutomaticInterrupts: bindMethod('configureAutomaticInterrupts'),
  stopCompletedSoundVoice: bindMethod('stopCompletedSoundVoice'),
};
