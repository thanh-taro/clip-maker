// MOD-Engine — preview playback and seeking in the engine worker
// (specs/40-technical/modules/MOD-Engine.md, ADR-0003, ADR-0009 and their outcomes). The worker
// speaks MOD-Core's `ToEngine` / `FromEngine` messages; the sequential reader serves exports.
// Starting the worker: a hashed same-origin module (CSP `worker-src 'self'`).

/** Starts the engine worker (ADR-0003 §2). All code loads at start-up (ADR-0002, no lazy chunks). */
export function startEngineWorker(): Worker {
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'engine' });
}

export { createSequentialFrameReader, type SequentialFrameReader } from './sequential';
export { Engine, SLOW_PAINTS, SLOW_WINDOW_MS, WARMUP_US } from './engine';
export type { EngineDeps, EngineFrame, SlotLike, VideoSourceLike, CoarseBitmap } from './engine';
export { DecoderSlot, PLAY_WAIT_MS } from './decoder';
export type { DecodedFrame, DecoderFactory, DecoderLike, FrameResult, PacketLike, TrackReader } from './decoder';
export {
  assignSlots,
  COARSE_AFTER_FRAMES,
  EPSILON_US,
  evictionIndex,
  FEED_AHEAD,
  insertionIndex,
  isLeadingPicture,
  MAX_FRAMES,
  needsRestart,
  newestAtOrBefore,
  pickFrame,
  wantsFeed,
  type DecoderState,
  type FrameMode,
} from './frames';
export { BUDGETS, deviceClass, platformHints, type Budget, type DeviceClass, type PlatformHints } from './budget';
export { CoarseCache, COARSE_INTERVAL_US, COARSE_MIN_SPACING_S, keepsCoarse } from './coarse';
