// MOD-Export — video, GIF and audio exports end to end (specs/40-technical/modules/MOD-Export.md,
// ADR-0010). The hand-over of a finished file uses a `blob:` URL and `<a download>`, never a `data:`
// URL (portal tool contract, MOD-Host). Phase 3.3 scaffold: starting the idle export worker and the
// public surface; built with F-015, F-016 and F-019.R7.
import { notImplemented, type Project } from '../core';

/** Created idle at start-up so a first export makes no request (architecture.md "Budgets"). */
export function startExportWorker(): Worker {
  return new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module', name: 'export' });
}

export const estimate = (_project: Project, _settings: unknown): never => notImplemented('MOD-Export estimate');
export const start = (_project: Project, _settings: unknown): never => notImplemented('MOD-Export start');
