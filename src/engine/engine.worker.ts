// MOD-Engine — the engine worker (ADR-0003 §2): MOD-Container reads, MOD-Codec decoders, the engine's
// scheduling and frame caches, and MOD-Compositor drawing into the preview canvas the main thread hands
// over once. Decoded frames never cross a thread. Answers the start-up handshake and the
// MOD-Core `ToEngine` messages with `FromEngine` events.
import { helloFrom, type FromEngine, type ToEngine, type WorkerScope } from '../core';
import { createCompositor, effectsCheck } from '../compositor';
import { BUDGETS, deviceClass, platformHints } from './budget';
import { Engine, type EngineDeps, type EngineFrame } from './engine';
import { openVideoSource } from './video';

/** Coarse copies are preview-size (ADR-0009 outcome rule 4): longer side 640 px. */
const COARSE_SIDE = 640;

const scope = self as unknown as WorkerScope<ToEngine, FromEngine>;
const cls = deviceClass(platformHints());

const engine = new Engine({
  post: (m) => scope.postMessage(m),
  createCompositor,
  // VideoFrame is an EngineFrame; the slot's callbacks only ever receive the frames it decoded.
  openVideo: openVideoSource as unknown as EngineDeps['openVideo'],
  effectsCheck,
  coarseCopy: async (f: EngineFrame) => {
    const frame = (f as unknown as VideoFrame).clone();
    try {
      const k = Math.min(1, COARSE_SIDE / Math.max(frame.displayWidth, frame.displayHeight));
      return await createImageBitmap(frame, {
        resizeWidth: Math.max(1, Math.round(frame.displayWidth * k)),
        resizeHeight: Math.max(1, Math.round(frame.displayHeight * k)),
        resizeQuality: 'medium',
      });
    } finally {
      frame.close();
    }
  },
  budget: BUDGETS[cls],
  phone: cls === 'phone',
  now: () => performance.now(),
});

scope.onmessage = (e: MessageEvent<ToEngine>) => {
  const m = e.data;
  if (m?.type === 'hello') {
    scope.postMessage(helloFrom('engine') as FromEngine);
    return;
  }
  engine.handle(m);
};
