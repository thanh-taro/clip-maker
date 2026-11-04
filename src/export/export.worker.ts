// MOD-Export — the export (video) worker (ADR-0003 §5, ADR-0010): plan → decode → paint → encode →
// mux into a sink. Created idle at start-up, terminated on cancel. Phase 3.3 stub: answers the
// start-up handshake only; built with F-015 / F-016.
import { helloFrom, type ToWorker, type WorkerScope } from '../core';

const scope = self as unknown as WorkerScope;
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'hello') scope.postMessage(helloFrom('export'));
};
