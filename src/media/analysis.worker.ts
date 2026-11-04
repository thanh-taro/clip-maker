// MOD-Media — the analysis worker (ADR-0003 §4): probing new files, thumbnails and waveforms.
// Phase 3.3 stub: answers the start-up handshake only; intake comes with F-001.
import { helloFrom, type ToWorker, type WorkerScope } from '../core';

const scope = self as unknown as WorkerScope;
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'hello') scope.postMessage(helloFrom('analysis'));
};
