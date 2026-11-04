// MOD-Audio — the audio worker (ADR-0003 §3): windowed decode, resample, WSOLA, mix, limiter,
// streaming 48 kHz blocks to the worklet. Phase 3.3 stub: answers the start-up handshake only.
import { helloFrom, type ToWorker, type WorkerScope } from '../core';

const scope = self as unknown as WorkerScope;
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'hello') scope.postMessage(helloFrom('audio'));
};
