// MOD-Audio — windowed decoding, resampling, time-stretch, mix, limiter, playback clock
// (specs/40-technical/modules/MOD-Audio.md, ADR-0008). Phase 3.3 scaffold: starting the audio and
// export-audio workers, the worklet module's URL, and the public surface; built with F-002, F-005,
// F-009, F-011 and F-016.
import { notImplemented, type Micros } from '../core';
import type { AudioPlan } from '../plan';
// The worklet is bundled as its own hashed same-origin module (ADR-0003; CSP `script-src 'self'`).
import workletUrl from './playback.worklet.ts?worker&url';

/** URL of the AudioWorklet module, for `audioContext.audioWorklet.addModule` in the Play gesture. */
export const WORKLET_URL: string = workletUrl;

export function startAudioWorker(): Worker {
  return new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module', name: 'audio' });
}

/** Created idle at start-up so a first export makes no request (ADR-0003 outcome). */
export function startExportAudioWorker(): Worker {
  return new Worker(new URL('./export-audio.worker.ts', import.meta.url), { type: 'module', name: 'export-audio' });
}

export const render = (_plan: AudioPlan, _fromSample: number, _count: number): [Float32Array, Float32Array] =>
  notImplemented('MOD-Audio render');
export const clock = {
  now: (): Micros => notImplemented('MOD-Audio clock.now'),
};
