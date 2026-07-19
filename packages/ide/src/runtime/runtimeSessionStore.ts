import type { IdeRuntimeSession, IdeRuntimeTransport } from '@/runtime/ideRuntimeSession';

export interface RuntimeSessionSnapshot {
  session: IdeRuntimeSession | null;
  transport: IdeRuntimeTransport | null;
  ready: boolean;
  epoch: number;
}

type RuntimeSessionListener = () => void;

export interface RuntimeSessionStore {
  getSnapshot(): RuntimeSessionSnapshot;
  getSession(): IdeRuntimeSession | null;
  replace(session: IdeRuntimeSession): IdeRuntimeSession | null;
  clear(expected?: IdeRuntimeSession | null): IdeRuntimeSession | null;
  dispose(session?: IdeRuntimeSession | null): Promise<void>;
  subscribe(listener: RuntimeSessionListener): () => void;
}

function resolveTransport(session: IdeRuntimeSession): IdeRuntimeTransport {
  return session.getRuntimeTransport?.() ?? 'in-process';
}

export function createRuntimeSessionStore(): RuntimeSessionStore {
  let snapshot: RuntimeSessionSnapshot = {
    session: null,
    transport: null,
    ready: false,
    epoch: 0,
  };
  const listeners = new Set<RuntimeSessionListener>();

  const publish = (session: IdeRuntimeSession | null): void => {
    snapshot = {
      session,
      transport: session ? resolveTransport(session) : null,
      ready: session !== null,
      epoch: snapshot.epoch + 1,
    };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    getSession: () => snapshot.session,
    replace(session) {
      const previous = snapshot.session;
      if (previous !== session) {
        publish(session);
      }
      return previous;
    },
    clear(expected) {
      const previous = snapshot.session;
      if (expected !== undefined && previous !== expected) {
        return null;
      }
      if (previous !== null) {
        publish(null);
      }
      return previous;
    },
    async dispose(session = snapshot.session) {
      if (!session) {
        return;
      }
      if (snapshot.session === session) {
        publish(null);
      }
      await session.controller?.dispose();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const runtimeSessionStore = createRuntimeSessionStore();
