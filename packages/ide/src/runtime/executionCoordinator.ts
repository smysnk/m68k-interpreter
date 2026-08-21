export type ExecutionCommand =
  | 'run'
  | 'resume'
  | 'pulseResume'
  | 'pause'
  | 'stop'
  | 'restart'
  | 'stepInto'
  | 'stepOver'
  | 'stepOut'
  | 'stepBack'
  | 'reset';

export type ExecutionCommandHandlers = Record<ExecutionCommand, () => void> & {
  runToAddress(address: number): void;
};

/** Imperative UI-to-runtime boundary. Redux stores outcomes, never transient commands. */
export class ExecutionCoordinator {
  private handlers: ExecutionCommandHandlers | null = null;
  private generation = 0;
  private readonly pending: Array<() => void> = [];

  bind(handlers: ExecutionCommandHandlers): () => void {
    this.generation += 1;
    const generation = this.generation;
    this.handlers = handlers;
    for (const command of this.pending.splice(0)) command();
    return () => {
      if (this.generation === generation) this.handlers = null;
    };
  }

  execute(command: ExecutionCommand): void {
    this.submit(() => this.handlers?.[command]());
  }

  runToAddress(address: number): void {
    this.submit(() => this.handlers?.runToAddress(address & 0x00ff_ffff));
  }

  isBound(): boolean {
    return this.handlers !== null;
  }

  private submit(command: () => void): void {
    if (this.handlers) {
      command();
      return;
    }
    if (this.pending.length >= 32) this.pending.shift();
    this.pending.push(command);
  }
}

export const executionCoordinator = new ExecutionCoordinator();
