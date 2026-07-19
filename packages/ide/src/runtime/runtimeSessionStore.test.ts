import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { createRuntimeSessionStore } from '@/runtime/runtimeSessionStore';

function createSession(transport: 'in-process' | 'worker' = 'in-process'): IdeRuntimeSession {
  return {
    getRuntimeTransport: () => transport,
    controller:
      transport === 'worker'
        ? ({ dispose: vi.fn(async () => undefined) } as unknown as IdeRuntimeSession['controller'])
        : undefined,
  } as IdeRuntimeSession;
}

describe('runtimeSessionStore', () => {
  it('publishes replacement and clear snapshots with monotonically increasing epochs', () => {
    const store = createRuntimeSessionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const first = createSession();
    const second = createSession('worker');

    expect(store.replace(first)).toBeNull();
    expect(store.getSnapshot()).toMatchObject({
      session: first,
      transport: 'in-process',
      ready: true,
      epoch: 1,
    });
    expect(store.replace(second)).toBe(first);
    expect(store.getSnapshot()).toMatchObject({ transport: 'worker', epoch: 2 });
    expect(store.clear(second)).toBe(second);
    expect(store.getSnapshot()).toMatchObject({ session: null, ready: false, epoch: 3 });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not let a stale runtime clear the active replacement', () => {
    const store = createRuntimeSessionStore();
    const first = createSession();
    const second = createSession();
    store.replace(first);
    store.replace(second);

    expect(store.clear(first)).toBeNull();
    expect(store.getSession()).toBe(second);
  });

  it('clears before awaiting worker disposal', async () => {
    const store = createRuntimeSessionStore();
    const session = createSession('worker');
    store.replace(session);

    await store.dispose(session);

    expect(store.getSession()).toBeNull();
    expect(session.controller?.dispose).toHaveBeenCalledOnce();
  });
});
