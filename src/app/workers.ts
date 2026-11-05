// MOD-App — starts the dedicated workers of ADR-0003 at start-up (all code loads at start, ADR-0002;
// both export workers are created idle so a first export makes no request) and checks each answers
// the protocol handshake. The export pair belongs to MOD-Export's ExportWorkers (one owner, so there
// are never two idle pairs); MOD-Scratch's start-up lock and sweep run here too (F-015.AC14).
import { signal } from '@preact/signals';
import { isHello, type ToWorker, type WorkerName } from '../core';
import { startAudioWorker, WORKLET_URL } from '../audio';
import { startEngineWorker } from '../engine';
import { ExportWorkers, initScratch, type Scratch } from '../export';
import { startAnalysisWorker } from '../media';

/** Workers that answered the handshake with the current protocol. */
export const workersReady = signal<readonly WorkerName[]>([]);

/** The export worker pair's one owner (created at start-up, idle). */
export let exportWorkers: ExportWorkers | null = null;
const exportPair = (): ExportWorkers => (exportWorkers ??= new ExportWorkers());

/** This session's scratch: its Web Lock is held for the page's life and abandoned files are swept. */
export let scratchReady: Promise<Scratch> | null = null;

const STARTERS: Record<WorkerName, () => Worker> = {
  engine: startEngineWorker,
  audio: startAudioWorker,
  analysis: startAnalysisWorker,
  export: () => exportPair().peek().video,
  'export-audio': () => exportPair().peek().audio,
};

export const workers = new Map<WorkerName, Worker>();

export function startWorkers(): void {
  scratchReady ??= initScratch().then((r) => r.scratch);
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
