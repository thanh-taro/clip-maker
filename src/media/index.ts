// MOD-Media — intake, probing, source registry, thumbnails and waveforms
// (specs/40-technical/modules/MOD-Media.md, ADR-0009). Phase 3.3 scaffold: starting the analysis
// worker and the public surface; built with F-001 and F-023.R2.
import { notImplemented } from '../core';

export function startAnalysisWorker(): Worker {
  return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module', name: 'analysis' });
}

export const intake = (_files: readonly File[], _onProgress: (done: number) => void, _signal: AbortSignal): never =>
  notImplemented('MOD-Media intake');
export const registry = {
  get: (_id: string): never => notImplemented('MOD-Media registry.get'),
  retain: (_id: string): never => notImplemented('MOD-Media registry.retain'),
  release: (_id: string): never => notImplemented('MOD-Media registry.release'),
};
export const thumbnails = (_sourceId: string, _range: unknown, _height: number): never =>
  notImplemented('MOD-Media thumbnails');
export const waveform = (_sourceId: string, _range: unknown): never => notImplemented('MOD-Media waveform');
