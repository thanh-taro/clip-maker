// MOD-Engine — the engine worker (ADR-0003 §2): preview decoding, frame cache, seeking and painting.
// Phase 3.3 stub: answers the start-up handshake only; `setProject`, `tick`, `seek` … come with F-002.
import { helloFrom, type ToWorker, type WorkerScope } from '../core';

const scope = self as unknown as WorkerScope;
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'hello') scope.postMessage(helloFrom('engine'));
};
