import { InterpreterWorkerHost } from '@/runtime/worker/InterpreterWorkerHost';
import type { InterpreterWorkerCommand, InterpreterWorkerEvent } from '@/runtime/worker/interpreterWorkerProtocol';

interface WorkerScopeLike {
  postMessage(message: InterpreterWorkerEvent): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: InterpreterWorkerCommand }) => void
  ): void;
}

const workerScope = self as unknown as WorkerScopeLike;
const host = new InterpreterWorkerHost((event) => {
  workerScope.postMessage(event);
});

workerScope.addEventListener('message', (event) => {
  void host.handleCommand(event.data);
});
