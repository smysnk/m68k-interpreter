import { describe, expect, it, vi } from 'vitest';
import { ExecutionCoordinator, type ExecutionCommandHandlers } from './executionCoordinator';

function handlers(): ExecutionCommandHandlers {
  return {
    run: vi.fn(),
    resume: vi.fn(),
    pulseResume: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    stepInto: vi.fn(),
    stepOver: vi.fn(),
    stepOut: vi.fn(),
    stepBack: vi.fn(),
    reset: vi.fn(),
    runToAddress: vi.fn(),
  };
}

describe('ExecutionCoordinator', () => {
  it('queues early UI commands and routes them directly after binding', () => {
    const coordinator = new ExecutionCoordinator();
    const bound = handlers();
    coordinator.execute('run');
    coordinator.bind(bound);
    coordinator.execute('stepOver');
    coordinator.runToAddress(0x12000000);
    expect(bound.run).toHaveBeenCalledOnce();
    expect(bound.stepOver).toHaveBeenCalledOnce();
    expect(bound.runToAddress).toHaveBeenCalledWith(0x000000);
  });

  it('does not let stale cleanup detach a replacement runtime', () => {
    const coordinator = new ExecutionCoordinator();
    const first = handlers();
    const second = handlers();
    const unbindFirst = coordinator.bind(first);
    coordinator.bind(second);
    unbindFirst();
    coordinator.execute('pause');
    expect(first.pause).not.toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalledOnce();
  });
});
