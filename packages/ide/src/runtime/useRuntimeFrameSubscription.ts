import type { IdeRuntimeController } from '@/runtime/ideRuntimeSession';
import type { InterpreterWorkerEvent } from '@/runtime/worker/interpreterWorkerProtocol';

type RuntimeEvent = Exclude<InterpreterWorkerEvent, { type: 'ready' } | { type: 'reply' }>;

export function subscribeToCurrentRuntimeFrames(options: {
  controller: IdeRuntimeController;
  isCurrent: () => boolean;
  onEvent: (event: RuntimeEvent) => void;
}): () => void {
  if (!options.controller.subscribeEvents) return () => undefined;
  return options.controller.subscribeEvents((event) => {
    if (options.isCurrent()) options.onEvent(event);
  });
}
