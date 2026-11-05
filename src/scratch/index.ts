// MOD-Scratch — the only on-device storage, used during export only
// (specs/40-technical/modules/MOD-Scratch.md, ADR-0010 §2–§3 and outcome items 5–6). The only module
// allowed to touch `navigator.storage` / the origin-private file system (lint-enforced). Depends on no
// other module. Promoted from SP-storage `scratch.js`: session-unique names, this session's Web Lock
// for the page's life, the lock-guarded start-up sweep (no heartbeats), deletion 10 s after the
// hand-over (WebKit lost saves deleted 3–79 ms after the click), writes in ≥ 1 MB batches.
// Main thread: `Scratch` (hasRoom, create → file/discard/handedOver, sweep, cleanup). Export worker:
// `openScratchSink` (the synchronous access handle; MOD-Container's Sink).
// Implements: F-015.R7, F-019.R7, INV-01, NFR-11.

/** The one directory MOD-Scratch owns. */
/** The one directory MOD-Scratch owns, named for the tool (the origin may host other tools). */
export const SCRATCH_DIR = 'clip-maker-scratch';
/** Success: nothing revoked or deleted for 10 s after the download click (ADR-0010 outcome item 6). */
export const HANDOVER_HOLD_MS = 10_000;
/** Writes go out in batches of at least 1 MB (sync-handle writes 2–4× slower with 64 KB). */
export const BATCH_BYTES = 1 << 20;

/** The Web Lock this session holds for the page's life. */
export const lockName = (session: string): string => `clipmaker-scratch:${session}`;

const NAME = /^export-([a-z0-9]+)-([a-z0-9]+)\.part$/;
/** `scratch/export-<session>-<random>.part` (ADR-0010 outcome item 6). */
export const scratchName = (session: string, random: string): string => `export-${session}-${random}.part`;
export function parseScratchName(name: string): { session: string; random: string } | null {
  const m = NAME.exec(name);
  return m ? { session: m[1]!, random: m[2]! } : null;
}

const base36 = (bytes: Uint8Array): string => [...bytes].map((b) => (b % 36).toString(36)).join('');
/** A random lower-case id for a session or a file (`crypto.getRandomValues`). */
export const randomId = (length = 10): string => base36(crypto.getRandomValues(new Uint8Array(length)));

// ── Platform shapes (the parts used; fakes in tests) ─────────────────────────────────────────────────

export interface SyncHandleLike {
  write(data: Uint8Array, options: { at: number }): number;
  read(data: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
export interface FileHandleLike {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createSyncAccessHandle?(): Promise<SyncHandleLike>;
}
export interface DirLike {
  entries(): AsyncIterable<[string, { readonly kind: string }]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
}
export interface StorageLike {
  estimate(): Promise<{ quota?: number; usage?: number }>;
  getDirectory(): Promise<{ getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirLike> }>;
}
export interface LocksLike {
  request<T>(
    name: string,
    options: { mode?: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: unknown) => T | Promise<T>,
  ): Promise<T>;
}

/** The browser's storage and locks, where present (no OPFS in ephemeral WebKit contexts). */
export function browserStorage(): { storage: StorageLike | null; locks: LocksLike | null } {
  const nav = (globalThis as { navigator?: { storage?: Partial<StorageLike>; locks?: LocksLike } }).navigator;
  const s = nav?.storage;
  return {
    storage: s && typeof s.getDirectory === 'function' && typeof s.estimate === 'function' ? (s as StorageLike) : null,
    locks: nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : null,
  };
}

async function scratchDir(storage: StorageLike): Promise<DirLike> {
  return (await storage.getDirectory()).getDirectoryHandle(SCRATCH_DIR, { create: true });
}

// ── Writing (export worker) ──────────────────────────────────────────────────────────────────────────

/** A positioned byte sink (MOD-Container's `Sink`). */
export interface ByteSink {
  write(chunk: Uint8Array, position: number): void | Promise<void>;
  close(): void | Promise<void>;
}

/**
 * Collects contiguous writes into batches of at least `size` bytes before they reach `out`; a write
 * elsewhere (the writer patching a header) flushes the batch first. Implements: ADR-0010 outcome item 5.
 */
export class BatchingSink implements ByteSink {
  private buf: Uint8Array;
  private start = 0;
  private len = 0;
  written = 0;
  batches = 0;
  constructor(
    private readonly out: (chunk: Uint8Array, position: number) => void,
    private readonly size = BATCH_BYTES,
  ) {
    this.buf = new Uint8Array(size);
  }
  write(chunk: Uint8Array, position: number): void {
    if (this.len > 0 && position !== this.start + this.len) this.flush();
    if (this.len === 0) this.start = position;
    let at = 0;
    while (at < chunk.length) {
      const n = Math.min(chunk.length - at, this.size - this.len);
      this.buf.set(chunk.subarray(at, at + n), this.len);
      this.len += n;
      at += n;
      if (this.len === this.size) {
        this.flush();
        this.start = position + at;
      }
    }
  }
  flush(): void {
    if (this.len === 0) return;
    this.out(this.buf.subarray(0, this.len), this.start);
    this.written += this.len;
    this.batches++;
    this.start += this.len;
    this.len = 0;
  }
  close(): void {
    this.flush();
  }
}

/** The export's scratch file opened for writing in the export worker. */
export interface ScratchSink extends ByteSink {
  readonly name: string;
  /** Bytes in the file so far (largest end written). */
  readonly size: number;
  /** Writes out the pending batch (the size is then final). */
  flush(): void;
  /** Empties the file for a fresh write (the size target's corrective pass). */
  reset(): void;
  /** Closes the handle (needed before any delete: an open handle makes it fail everywhere). */
  close(): void;
  /** Closes the handle and deletes the file at once (failure or cancel). */
  discard(): Promise<void>;
}

/**
 * Creates `scratch/<name>` and its synchronous access handle (export worker only). Throws when the
 * handle can't be opened (Playwright WebKit's "unknown transient reason"; no OPFS) — the caller then
 * falls back to the memory sink. Implements: ADR-0010 §2.1, outcome item 5.
 */
async function openHandle(name: string, storage: StorageLike): Promise<{ dir: DirLike; handle: SyncHandleLike }> {
  // Defence in depth: only our own `export-<session>-<random>.part` names are ever opened.
  if (!parseScratchName(name)) throw new Error(`SecurityError: not a scratch file name: ${name}`);
  const dir = await scratchDir(storage);
  const fh = await dir.getFileHandle(name, { create: true });
  try {
    if (!fh.createSyncAccessHandle) throw new Error('NotSupportedError: no synchronous access handle');
    return { dir, handle: await fh.createSyncAccessHandle() };
  } catch (e) {
    await dir.removeEntry(name).catch(() => undefined);
    throw e;
  }
}

export async function openScratchSink(name: string, storage: StorageLike): Promise<ScratchSink> {
  const { dir, handle } = await openHandle(name, storage);
  let size = 0;
  let open = true;
  const batch = new BatchingSink((chunk, at) => {
    let done = 0;
    while (done < chunk.length) done += handle.write(chunk.subarray(done), { at: at + done });
    size = Math.max(size, at + chunk.length);
  });
  const close = (): void => {
    if (!open) return;
    open = false;
    try {
      batch.close();
      handle.flush();
    } finally {
      handle.close();
    }
  };
  return {
    name,
    get size() {
      return size;
    },
    write: (chunk, position) => batch.write(chunk, position),
    flush: () => {
      batch.flush();
      handle.flush();
    },
    reset: () => {
      batch.flush();
      handle.truncate(0);
      size = 0;
    },
    close,
    async discard() {
      try {
        close();
      } catch {
        /* the delete below still runs */
      }
      await dir.removeEntry(name).catch(() => undefined);
    },
  };
}

/**
 * A second scratch file where encoded video waits until the verified sound arrives (MOD-Export's
 * spill store; ADR-0010 outcome item 1: never held in memory). Same naming, so the sweep and the
 * discard rules cover it.
 */
export interface ScratchSpill {
  append(data: Uint8Array): number;
  read(offset: number, length: number): Uint8Array;
  readonly bytes: number;
  discard(): Promise<void>;
}

export async function openScratchSpill(name: string, storage: StorageLike): Promise<ScratchSpill> {
  const { dir, handle } = await openHandle(name, storage);
  let bytes = 0;
  let open = true;
  return {
    get bytes() {
      return bytes;
    },
    append(data) {
      const at = bytes;
      let done = 0;
      while (done < data.length) done += handle.write(data.subarray(done), { at: at + done });
      bytes += data.length;
      return at;
    },
    read(offset, length) {
      const out = new Uint8Array(length);
      let done = 0;
      while (done < length) {
        const n = handle.read(out.subarray(done), { at: offset + done });
        if (n <= 0) throw new Error('spill: short read');
        done += n;
      }
      return out;
    },
    async discard() {
      if (open) {
        open = false;
        try {
          handle.close();
        } catch {
          /* closed already */
        }
      }
      await dir.removeEntry(name).catch(() => undefined);
    },
  };
}

// ── Housekeeping (main thread) ───────────────────────────────────────────────────────────────────────

export interface ScratchEnv {
  readonly storage: StorageLike | null;
  readonly locks: LocksLike | null;
  readonly session: string;
  readonly now: () => number;
  readonly setTimeout: (f: () => void, ms: number) => unknown;
  readonly clearTimeout: (id: unknown) => void;
  readonly revokeObjectURL: (url: string) => void;
}

export function browserScratchEnv(session = randomId()): ScratchEnv {
  return {
    ...browserStorage(),
    session,
    now: () => Date.now(),
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as number),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

export interface SweepLog {
  readonly deleted: string[];
  readonly skipped: { readonly name: string; readonly why: string }[];
}

/** One export's scratch file, seen from the main thread. */
export interface ScratchFile {
  readonly name: string;
  /** The export's spill file (encoded video waiting for the sound), deleted with the export's file. */
  readonly spill: string;
  /** The finished file (after the worker closed its handle), for the `blob:` hand-over. */
  file(): Promise<File>;
  /** Failure or cancel: delete at once (the worker is terminated, so its handle is gone). */
  discard(): Promise<void>;
  /** The download was clicked at `at` with `url`: revoke and delete 10 s later. */
  handedOver(url: string | null, at?: number): void;
}

interface Handed {
  readonly at: number;
  readonly url: string | null;
  readonly timer: unknown;
}

export class Scratch {
  private readonly handed = new Map<string, Handed>();
  private lock: Promise<boolean> | null = null;

  constructor(private readonly env: ScratchEnv) {}

  get session(): string {
    return this.env.session;
  }

  /** The origin-private file system is there (not in Playwright WebKit's ephemeral context). */
  get available(): boolean {
    return this.env.storage !== null;
  }

  /**
   * Implements: F-019.R7, ADR-0010 outcome item 5 — `quota − usage ≥ bytes` (Chrome's usage may
   * include a same-site tab's scratch; WebKit's frame quota is 1/10 of standalone).
   */
  async hasRoom(bytes: number): Promise<boolean> {
    if (!this.env.storage) return false;
    try {
      const { quota = 0, usage = 0 } = await this.env.storage.estimate();
      return quota - usage >= bytes;
    } catch {
      return false;
    }
  }

  /** Takes this session's exclusive lock for the page's life (resolves when granted). */
  holdSessionLock(): Promise<boolean> {
    const locks = this.env.locks;
    if (!locks) return Promise.resolve(false);
    return (this.lock ??= new Promise<boolean>((granted) => {
      void locks.request(lockName(this.env.session), { mode: 'exclusive' }, () => {
        granted(true);
        return new Promise<void>((unlock) => (this.unlock = unlock));
      });
    }));
  }

  private unlock: (() => void) | null = null;

  /** Gives the session lock back (RULE-22: an unsupported device keeps no scratch session). */
  releaseSessionLock(): void {
    this.unlock?.();
    this.unlock = null;
  }

  /** A new export file name of this session; MOD-Export opens it in the export worker. */
  create(): ScratchFile {
    const name = scratchName(this.env.session, randomId(8));
    const spill = scratchName(this.env.session, randomId(8));
    return {
      name,
      spill,
      file: () => this.file(name),
      discard: async () => {
        await this.discard(spill);
        await this.discard(name);
      },
      handedOver: (url, at = this.env.now()) => this.handedOver(name, url, at),
    };
  }

  async file(name: string): Promise<File> {
    if (!this.env.storage) throw new Error('NotFoundError: no scratch storage');
    const fh = await (await scratchDir(this.env.storage)).getFileHandle(name);
    return fh.getFile();
  }

  /** Implements: INV-01, F-015.R7 — a failed or cancelled export's file goes at once. */
  async discard(name: string): Promise<void> {
    const h = this.handed.get(name);
    if (h) this.env.clearTimeout(h.timer);
    this.handed.delete(name);
    if (h?.url) this.env.revokeObjectURL(h.url);
    await this.remove(name);
  }

  /** Implements: ADR-0010 outcome item 6 — after the click, nothing is revoked or deleted for 10 s. */
  handedOver(name: string, url: string | null, at = this.env.now()): void {
    const old = this.handed.get(name);
    if (old) this.env.clearTimeout(old.timer);
    const wait = Math.max(0, at + HANDOVER_HOLD_MS - this.env.now());
    const timer = this.env.setTimeout(() => void this.release(name), wait);
    this.handed.set(name, { at, url, timer });
  }

  /** Files handed over and not yet released (tests, the export panel's Share window). */
  get pending(): readonly string[] {
    return [...this.handed.keys()];
  }

  private async release(name: string): Promise<void> {
    const h = this.handed.get(name);
    if (!h) return;
    this.env.clearTimeout(h.timer);
    this.handed.delete(name);
    if (h.url) this.env.revokeObjectURL(h.url);
    await this.remove(name);
  }

  /**
   * Implements: ADR-0010 outcome item 6 — on the next export or New project, this session's earlier
   * files whose 10 s are up are deleted; a younger file keeps its timer.
   */
  async cleanup(): Promise<string[]> {
    const removed: string[] = [];
    if (!this.env.storage) return removed;
    const now = this.env.now();
    for (const name of await this.names()) {
      if (parseScratchName(name)?.session !== this.env.session) continue;
      const h = this.handed.get(name);
      if (h && h.at + HANDOVER_HOLD_MS > now) continue;
      if (h) await this.release(name);
      else await this.remove(name);
      removed.push(name);
    }
    return removed;
  }

  /** `pagehide`: start the same clean-up, best effort only (it never completes, SP-storage). */
  pagehide(): void {
    void this.cleanup().catch(() => undefined);
  }

  /**
   * Implements: F-015.AC14, INV-01, ADR-0010 outcome item 6 — at start-up, holding this session's lock,
   * delete another session's `export-<sid>-*.part` only inside a granted `ifAvailable` request for that
   * session's lock; skip live sessions, names that are not ours and files whose delete throws. No
   * sweep without Web Locks.
   */
  async sweep(): Promise<SweepLog> {
    const log: SweepLog = { deleted: [], skipped: [] };
    const { storage, locks } = this.env;
    if (!storage || !locks) return log;
    await this.holdSessionLock();
    let dir: DirLike;
    try {
      dir = await scratchDir(storage);
    } catch {
      return log;
    }
    for (const name of await this.names()) {
      const parsed = parseScratchName(name);
      if (!parsed) {
        log.skipped.push({ name, why: 'not ours' });
        continue;
      }
      if (parsed.session === this.env.session) {
        log.skipped.push({ name, why: 'own session' });
        continue;
      }
      const dead = await locks.request(lockName(parsed.session), { ifAvailable: true }, async (lock) => {
        if (!lock) return false;
        try {
          await dir.removeEntry(name);
          log.deleted.push(name);
        } catch (e) {
          log.skipped.push({ name, why: `delete failed: ${e instanceof Error ? e.name : String(e)}` });
        }
        return true;
      });
      if (!dead) log.skipped.push({ name, why: 'live session' });
    }
    return log;
  }

  /** The names in the scratch directory (tests and storage inspection). */
  async names(): Promise<string[]> {
    if (!this.env.storage) return [];
    const out: string[] = [];
    try {
      for await (const [name, h] of (await scratchDir(this.env.storage)).entries())
        if (h.kind === 'file') out.push(name);
    } catch {
      /* no usable origin-private file system here (e.g. an ephemeral WebKit context) */
    }
    return out;
  }

  private async remove(name: string): Promise<void> {
    if (!this.env.storage) return;
    try {
      await (await scratchDir(this.env.storage)).removeEntry(name);
    } catch {
      /* gone already, or still open: the next export or start-up removes it */
    }
  }
}

/**
 * Implements: F-015.AC14, INV-01, ADR-0010 outcome item 6 — at start-up: this session takes its Web
 * Lock for the page's life, then sweeps what closed pages left. Called once by the app at boot; the
 * returned Scratch is the one every export uses.
 */
export async function initScratch(env: ScratchEnv = browserScratchEnv()): Promise<{ scratch: Scratch; log: SweepLog }> {
  const scratch = new Scratch(env);
  await scratch.holdSessionLock();
  const log = await scratch.sweep().catch(() => ({ deleted: [], skipped: [] }));
  return { scratch, log };
}
