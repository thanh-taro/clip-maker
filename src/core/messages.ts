// MOD-Core — the typed, versioned message protocol between threads (ADR-0003 consequences,
// architecture.md "Modules"). Phase 3.3: only the start-up handshake every worker answers; each
// module adds its own messages (MOD-Engine `setProject`/`tick`, MOD-Audio `play`, …) in phase 4.

/** Bumped whenever a message shape changes; a worker answering another version is a build bug. */
export const PROTOCOL_VERSION = 1;

/** The dedicated workers of ADR-0003 (and its outcome: two workers per export) and the worklet. */
export type WorkerName = 'engine' | 'audio' | 'analysis' | 'export' | 'export-audio';

/** Main thread → any worker. */
export type ToWorker = { readonly type: 'hello' };

/** Any worker → main thread. */
export type FromWorker = {
  readonly type: 'hello';
  readonly worker: WorkerName;
  readonly protocol: number;
};

/** The handshake answer of a worker (pure, so every worker answers the same way). */
export function helloFrom(worker: WorkerName): FromWorker {
  return { type: 'hello', worker, protocol: PROTOCOL_VERSION };
}

/** Is `data` a handshake answer of the current protocol from `worker`? */
export function isHello(data: unknown, worker: WorkerName): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as Partial<FromWorker>;
  return m.type === 'hello' && m.worker === worker && m.protocol === PROTOCOL_VERSION;
}

/**
 * The part of a dedicated worker's global scope the workers use, typed by protocol. (The page's
 * TypeScript program has the DOM library, not WebWorker, so workers cast `self` to this.)
 */
export interface WorkerScope<In = ToWorker, Out = FromWorker> {
  onmessage: ((e: MessageEvent<In>) => void) | null;
  postMessage(message: Out, transfer?: Transferable[]): void;
}
