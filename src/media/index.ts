// MOD-Media — intake, probing, source registry, thumbnails and waveforms
// (specs/40-technical/modules/MOD-Media.md, ADR-0009). Intake, probing and the registry are built
// (E2); thumbnails and waveforms come with F-001's media panel and F-003's timeline.
import { notImplemented, type FrameRate } from '../core';
import { closeProbed, intakeBatch, type IntakeItem, type IntakeProgress, type IntakeResult } from './intake';
import { SourceRegistry } from './registry';
import type { FromAnalysis, ProbeOutcome, ToAnalysis } from './types';

export { closeProbed, FAILED_REASON, intakeBatch } from './intake';
export type {
  AcceptedSource,
  FolderItem,
  IntakeItem,
  IntakeNotice,
  IntakeProgress,
  IntakeResult,
  Refusal,
} from './intake';
// The probe (and with it the container reader) is imported by the analysis worker only, never by
// the page (MOD-Container runs in workers only).
export { photoHeaderSize } from './photo-header';
export { SourceRegistry, type Decoded, type Redecode, type RegistryEntry } from './registry';
export type * from './types';

export function startAnalysisWorker(): Worker {
  return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module', name: 'analysis' });
}

/** Probes files in the analysis worker; one request per file, cancellable. */
export function workerProbe(
  worker: Worker,
): (file: File, rate: FrameRate, signal: AbortSignal) => Promise<ProbeOutcome> {
  let next = 1;
  return (file, rate, signal) =>
    new Promise<ProbeOutcome>((resolve, reject) => {
      const id = next++;
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        signal.removeEventListener('abort', onAbort);
      };
      const onMessage = (e: MessageEvent<FromAnalysis>) => {
        if (e.data?.id !== id) return;
        cleanup();
        if (e.data.type === 'probed') resolve(e.data.outcome);
        else reject(signal.reason);
      };
      // Cancel answers at once; the worker drops the file it was checking (F-001.R6). A reply that was
      // already on its way is caught once and its decoded pictures are freed.
      const onAbort = () => {
        cleanup();
        const late = (e: MessageEvent<FromAnalysis>) => {
          if (e.data?.id !== id) return;
          worker.removeEventListener('message', late);
          if (e.data.type === 'probed') closeProbed(e.data.outcome);
        };
        worker.addEventListener('message', late);
        worker.postMessage({ type: 'cancel', id } satisfies ToAnalysis);
        reject(signal.reason);
      };
      if (signal.aborted) return reject(signal.reason);
      worker.addEventListener('message', onMessage);
      signal.addEventListener('abort', onAbort, { once: true });
      worker.postMessage({ type: 'probe', id, file, rate } satisfies ToAnalysis);
    });
}

/** The session's source registry (main thread). */
export const registry = new SourceRegistry();

let sourceCounter = 0;
/** Source ids for the session: unique, never reused (the same file added twice is two sources). */
export const nextSourceId = (): string => `src-${++sourceCounter}`;

export interface IntakeContext {
  readonly worker: Worker;
  readonly sourceCount: number;
  readonly rate: FrameRate;
}

/**
 * Implements: F-001.R2/R6 — checks a batch in the analysis worker and registers the accepted
 * sources. The caller applies `accepted` as one project step (RULE-13).
 */
export async function intake(
  files: readonly IntakeItem[],
  onProgress: (p: IntakeProgress) => void,
  signal: AbortSignal,
  ctx: IntakeContext,
): Promise<IntakeResult> {
  const result = await intakeBatch(files, {
    sourceCount: ctx.sourceCount,
    rate: ctx.rate,
    nextId: nextSourceId,
    probe: workerProbe(ctx.worker),
    onProgress,
    signal,
  });
  for (const a of result.accepted) registry.add(a);
  return result;
}

export const thumbnails = (_sourceId: string, _range: unknown, _height: number): never =>
  notImplemented('MOD-Media thumbnails');
export const waveform = (_sourceId: string, _range: unknown): never => notImplemented('MOD-Media waveform');
