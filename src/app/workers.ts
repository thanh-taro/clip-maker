// MOD-App — starts the dedicated workers of ADR-0003 at start-up (all code loads at start, ADR-0002;
// both export workers are created idle so a first export makes no request) and checks each answers
// the protocol handshake. Phase 3.3: nothing else is sent to them yet.
import { signal } from '@preact/signals';
import { isHello, type ToWorker, type WorkerName } from '../core';
import { startAudioWorker, WORKLET_URL } from '../audio';
import { startEngineWorker } from '../engine';
import { startExportAudioWorker, startExportWorker } from '../export';
import { startAnalysisWorker } from '../media';

/** Workers that answered the handshake with the current protocol. */
export const workersReady = signal<readonly WorkerName[]>([]);

const STARTERS: Record<WorkerName, () => Worker> = {
  engine: startEngineWorker,
  audio: startAudioWorker,
  analysis: startAnalysisWorker,
  export: startExportWorker,
  'export-audio': startExportAudioWorker,
};

export const workers = new Map<WorkerName, Worker>();

export function startWorkers(): void {
  for (const [name, start] of Object.entries(STARTERS) as [WorkerName, () => Worker][]) {
    const worker = start();
    workers.set(name, worker);
    const onHello = (e: MessageEvent<unknown>) => {
      if (!isHello(e.data, name)) return;
      worker.removeEventListener('message', onHello);
      workersReady.value = [...workersReady.value, name];
    };
    worker.addEventListener('message', onHello);
    worker.postMessage({ type: 'hello' } satisfies ToWorker);
  }
}

/**
 * Fetches the audio worklet module at start-up without running it (ADR-0002: every code file loads at
 * start-up; ADR-0015: the offline precache lists it). MOD-Audio adds it to the AudioContext in the
 * first Play gesture (F-002).
 */
export function preloadWorklet(): void {
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = WORKLET_URL;
  document.head.append(link);
}
