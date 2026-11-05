// Test support for MOD-Export's main-thread session: fake workers, storage, locks, visibility and clock.
import { ExportWorkers, type ExportCaps, type ExportContext, type VisibilitySource } from '../../src/export';
import { Scratch, type ScratchEnv } from '../../src/scratch';
import { proj, video } from './project';

export class FakeWorker extends EventTarget {
  readonly posted: unknown[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(m: unknown): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    const e = new MessageEvent('message', { data });
    this.onmessage?.(e);
    this.dispatchEvent(e);
  }
}

export const CAPS: ExportCaps = {
  videoFormat: { id: 'mp4-h264-aac', container: 'mp4', video: 'h264', audio: 'aac', fallback: false },
  audioFormat: { id: 'm4a-aac', fallback: false },
  video: { latencyMode: 'quality', acceleration: 'no-preference', bitrateModes: ['constant', 'variable'] },
  audio: { aac: { encoderDelay: 2112, deliveredKbps: 141 } },
};

export class FakeLocks {
  readonly held = new Set<string>();
  async request<T>(name: string, o: { ifAvailable?: boolean }, cb: (lock: unknown) => T | Promise<T>): Promise<T> {
    if (this.held.has(name)) return o.ifAvailable ? cb(null) : new Promise<T>(() => undefined);
    this.held.add(name);
    const r = await cb({ name });
    this.held.delete(name);
    return r;
  }
}

export function harness(
  o: {
    storage?: boolean;
    seconds?: number;
    locks?: boolean;
    failFirstRemove?: boolean;
    fileGate?: Promise<void>;
  } = {},
) {
  const pairs: { video: FakeWorker; audio: FakeWorker }[] = [];
  const workers = new ExportWorkers(() => {
    const p = { video: new FakeWorker(), audio: new FakeWorker() };
    pairs.push(p);
    return p as unknown as { video: Worker; audio: Worker };
  });
  const files = new Map<string, Uint8Array>();
  const failed = new Set<string>();
  const env: ScratchEnv = {
    storage: o.storage
      ? {
          estimate: async () => ({ quota: 10e9, usage: 0 }),
          getDirectory: async () => ({
            getDirectoryHandle: async () => ({
              async *entries() {
                for (const n of files.keys()) yield [n, { kind: 'file' }] as [string, { kind: string }];
              },
              getFileHandle: async (n: string) => ({
                kind: 'file' as const,
                getFile: async () => {
                  await o.fileGate;
                  return new File([(files.get(n) ?? new Uint8Array(0)) as BlobPart], n);
                },
              }),
              removeEntry: async (n: string) => {
                if (o.failFirstRemove && !failed.has(n)) {
                  failed.add(n);
                  throw new DOMException('open', 'NoModificationAllowedError');
                }
                files.delete(n);
              },
            }),
          }),
        }
      : null,
    locks: o.locks ? new FakeLocks() : null,
    session: 'sess1',
    now: () => clock.t,
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    revokeObjectURL: () => undefined,
  };
  const clock = { t: 1_000_000 };
  let hidden = false;
  const visListeners: (() => void)[] = [];
  const visibility: VisibilitySource = {
    hidden: () => hidden,
    onChange: (f) => (visListeners.push(f), () => undefined),
  };
  const ticks: (() => void)[] = [];
  const saved: { name: string; size: number }[] = [];
  const ctx: ExportContext = {
    workers,
    scratch: new Scratch(env),
    caps: CAPS,
    media: [],
    pcm: [{ sourceId: 'src-a', L: new Float32Array(10), R: new Float32Array(10) }],
    looks: {},
    texts: () => ({}),
    phone: true,
    gains: new Map(),
    visibility,
    now: () => clock.t,
    clock: () => new Date(2026, 10, 3, 14, 5, 9),
    save: (blob, name) => (saved.push({ name, size: blob.size }), 'blob:x'),
    setInterval: (f) => (ticks.push(f), ticks.length),
    clearInterval: () => undefined,
  };
  const project = proj({ clips: [video('a', o.seconds ?? 2)] });
  return {
    ctx,
    env,
    project,
    pairs,
    files,
    saved,
    clock,
    tick: () => ticks.forEach((f) => f()),
    hide: (h: boolean) => {
      hidden = h;
      visListeners.forEach((f) => f());
    },
  };
}

export const balanced = { kind: 'video', resolution: 720, quality: 'balanced' } as const;
export const lastPair = (h: ReturnType<typeof harness>) => h.pairs[0]!;
