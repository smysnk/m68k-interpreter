import { InterpreterWorkerHost } from '@/runtime/worker/InterpreterWorkerHost';
import type {
  InterpreterWorkerCommand,
  InterpreterWorkerEvent,
} from '@/runtime/worker/interpreterWorkerProtocol';

interface WorkerScopeLike {
  postMessage(message: InterpreterWorkerEvent, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: InterpreterWorkerCommand }) => void
  ): void;
}

const workerScope = self as unknown as WorkerScopeLike;
const host = new InterpreterWorkerHost((event) => {
  const pixels = event.type === 'frame' ? event.snapshot.graphicsPatch?.pixels : undefined;
  workerScope.postMessage(event, pixels ? [pixels.buffer] : undefined);
});

workerScope.addEventListener('message', (event) => {
  void host.handleCommand(event.data);
});
