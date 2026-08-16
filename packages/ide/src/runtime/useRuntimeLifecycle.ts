import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';

export async function disposeRuntimeReplacement(options: {
  previous: IdeRuntimeSession | null;
  clearPublishedRuntime: () => void;
  dispose: (runtime: IdeRuntimeSession | null) => Promise<void>;
}): Promise<void> {
  options.clearPublishedRuntime();
  await options.dispose(options.previous);
}
