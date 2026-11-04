// MOD-Audio — the export-audio worker (ADR-0003 outcome: two workers per export; ADR-0008): decodes
// the clips' sound first, then mixes, limits, encodes and verifies alongside the video.
// Phase 3.3 stub: answers the start-up handshake only; built with F-015 / F-016.
import { helloFrom, type ToWorker, type WorkerScope } from '../core';

const scope = self as unknown as WorkerScope;
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'hello') scope.postMessage(helloFrom('export-audio'));
};
