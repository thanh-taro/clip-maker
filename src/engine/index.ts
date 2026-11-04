// MOD-Engine — preview playback and seeking in the engine worker
// (specs/40-technical/modules/MOD-Engine.md, ADR-0003, ADR-0009). Phase 3.3 scaffold: starting the
// worker (a hashed same-origin module, CSP `worker-src 'self'`); its messages come with F-002.
import { notImplemented } from '../core';

/** Starts the engine worker (ADR-0003 §2). All code loads at start-up (ADR-0002, no lazy chunks). */
export function startEngineWorker(): Worker {
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'engine' });
}

/** The "decode every frame in order" reader the export uses — built with F-015. */
export const createSequentialFrameReader = (): never => notImplemented('MOD-Engine SequentialFrameReader');
