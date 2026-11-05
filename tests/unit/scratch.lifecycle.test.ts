// MOD-Scratch with fake storage, locks and timers: names, the lock-guarded sweep, the 10 s rule,
// clean-up on the next export, quota, 1 MB batches (ADR-0010 outcome items 5–6, SP-storage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BATCH_BYTES,
  BatchingSink,
  HANDOVER_HOLD_MS,
  lockName,
  openScratchSink,
  openScratchSpill,
  parseScratchName,
  Scratch,
  scratchName,
  type DirLike,
  type LocksLike,
  type ScratchEnv,
  type StorageLike,
  type SyncHandleLike,
} from '../../src/scratch';

class FakeDir implements DirLike {
  readonly files = new Map<string, Uint8Array>();
  readonly open = new Set<string>();
  readonly failing = new Set<string>();
  async *entries(): AsyncIterable<[string, { kind: string }]> {
    for (const name of [...this.files.keys()]) yield [name, { kind: 'file' }];
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!o?.create) throw new DOMException('missing', 'NotFoundError');
      this.files.set(name, new Uint8Array(0));
    }
    return {
      kind: 'file' as const,
      getFile: async () => new File([this.files.get(name)!.slice()], name),
      createSyncAccessHandle: async (): Promise<SyncHandleLike> => {
        this.open.add(name);
        return {
          write: (data, { at }) => {
            const old = this.files.get(name)!;
            const next = new Uint8Array(Math.max(old.length, at + data.length));
            next.set(old);
            next.set(data, at);
            this.files.set(name, next);
            return data.length;
          },
          read: (data, { at }) => {
            const src = this.files.get(name)!.subarray(at, at + data.length);
            data.set(src);
            return src.length;
          },
          truncate: (size) => void this.files.set(name, this.files.get(name)!.slice(0, size)),
          flush: () => undefined,
          close: () => void this.open.delete(name),
        };
      },
    };
  }
  async removeEntry(name: string): Promise<void> {
    if (this.failing.has(name)) throw new DOMException('busy', 'InvalidModificationError');
    if (this.open.has(name)) throw new DOMException('open', 'NoModificationAllowedError');
    if (!this.files.delete(name)) throw new DOMException('missing', 'NotFoundError');
  }
}

class FakeLocks implements LocksLike {
  readonly held = new Set<string>();
  readonly asked: string[] = [];
  async request<T>(name: string, o: { ifAvailable?: boolean }, cb: (lock: unknown) => T | Promise<T>): Promise<T> {
    this.asked.push(name);
    if (this.held.has(name)) {
      if (o.ifAvailable) return cb(null);
      return new Promise<T>(() => undefined);
    }
    this.held.add(name);
    const result = await cb({ name }); // released when the callback settles
    this.held.delete(name);
    return result;
  }
}

function env(dir: FakeDir, locks: FakeLocks | null, quota = { quota: 1000, usage: 400 }) {
  const storage: StorageLike = {
    estimate: async () => quota,
    getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
  };
  const revoked: string[] = [];
  const e: ScratchEnv = {
    storage,
    locks,
    session: 'me1',
    now: () => Date.now(),
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    revokeObjectURL: (u) => void revoked.push(u),
  };
  return { e, revoked, storage };
}

describe('MOD-Scratch names', () => {
  it('ADR-0010 outcome item 6 scratch files are export-<session>-<random>.part and the session lock is clipmaker-scratch:<session>', () => {
    expect(scratchName('abc123', 'x9')).toBe('export-abc123-x9.part');
    expect(parseScratchName('export-abc123-x9.part')).toEqual({ session: 'abc123', random: 'x9' });
    expect(parseScratchName('export-abc.part')).toBeNull();
    expect(parseScratchName('notes.txt')).toBeNull();
    expect(lockName('abc123')).toBe('clipmaker-scratch:abc123');
    const s = new Scratch(env(new FakeDir(), null).e);
    const name = s.create().name;
    expect(parseScratchName(name)?.session).toBe('me1');
  });
});

describe('MOD-Scratch sweep (F-015.AC14)', () => {
  it('F-015.AC14 the start-up sweep deletes only abandoned sessions’ files, inside a granted ifAvailable lock', async () => {
    const dir = new FakeDir();
    const locks = new FakeLocks();
    for (const n of ['export-dead1-a.part', 'export-dead1-b.part', 'export-live2-c.part', 'export-me1-d.part'])
      dir.files.set(n, new Uint8Array(4));
    dir.files.set('other.bin', new Uint8Array(1));
    locks.held.add(lockName('live2')); // another open tab
    const s = new Scratch(env(dir, locks).e);
    const log = await s.sweep();
    expect(log.deleted.sort()).toEqual(['export-dead1-a.part', 'export-dead1-b.part']);
    expect([...dir.files.keys()].sort()).toEqual(['export-live2-c.part', 'export-me1-d.part', 'other.bin']);
    expect(log.skipped.map((x) => x.why).sort()).toEqual(['live session', 'not ours', 'own session']);
    expect(locks.held.has(lockName('me1'))).toBe(true); // this session's lock, held for the page's life
  });

  it('ADR-0010 outcome item 6 a file whose delete throws is skipped and the sweep goes on', async () => {
    const dir = new FakeDir();
    dir.files.set('export-dead1-a.part', new Uint8Array(1));
    dir.files.set('export-dead2-b.part', new Uint8Array(1));
    dir.failing.add('export-dead1-a.part');
    const log = await new Scratch(env(dir, new FakeLocks()).e).sweep();
    expect(log.deleted).toEqual(['export-dead2-b.part']);
    expect(log.skipped[0]?.why).toMatch(/delete failed/);
  });

  it('ADR-0010 outcome item 6 without Web Locks there is no sweep', async () => {
    const dir = new FakeDir();
    dir.files.set('export-dead1-a.part', new Uint8Array(1));
    const log = await new Scratch(env(dir, null).e).sweep();
    expect(log.deleted).toEqual([]);
    expect(dir.files.size).toBe(1);
  });
});

describe('MOD-Scratch deletion timing (fake timers)', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('F-015.AC7 after the hand-over nothing is revoked or deleted for 10 s, then the URL is revoked and the file deleted', async () => {
    const dir = new FakeDir();
    const { e, revoked } = env(dir, null);
    const s = new Scratch(e);
    const f = s.create();
    dir.files.set(f.name, new Uint8Array(8));
    f.handedOver('blob:x');
    await vi.advanceTimersByTimeAsync(HANDOVER_HOLD_MS - 1);
    expect(dir.files.has(f.name)).toBe(true);
    expect(revoked).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dir.files.has(f.name)).toBe(false);
    expect(revoked).toEqual(['blob:x']);
    expect(s.pending).toEqual([]);
  });

  it('F-015.AC7 a failed or cancelled export’s file is deleted at once', async () => {
    const dir = new FakeDir();
    const s = new Scratch(env(dir, null).e);
    const f = s.create();
    dir.files.set(f.name, new Uint8Array(8));
    await f.discard();
    expect(dir.files.has(f.name)).toBe(false);
  });

  it('ADR-0010 outcome item 6 the next export deletes this session’s files whose 10 s are up; a younger file keeps its timer', async () => {
    const dir = new FakeDir();
    const { e, revoked } = env(dir, null);
    const s = new Scratch(e);
    const old = s.create();
    const young = s.create();
    for (const n of [old.name, young.name, 'export-other9-z.part']) dir.files.set(n, new Uint8Array(1));
    old.handedOver('blob:old', Date.now() - HANDOVER_HOLD_MS); // its timer could not run (hidden page)
    young.handedOver('blob:young');
    const removed = await s.cleanup();
    expect(removed).toEqual([old.name]);
    expect(revoked).toEqual(['blob:old']);
    expect(dir.files.has(young.name)).toBe(true);
    expect(dir.files.has('export-other9-z.part')).toBe(true); // other sessions: the sweep's job
    await vi.advanceTimersByTimeAsync(HANDOVER_HOLD_MS);
    expect(dir.files.has(young.name)).toBe(false);
  });
});

describe('MOD-Scratch space and writes', () => {
  it('F-019.R7 hasRoom is quota − usage ≥ bytes; no storage means no room', async () => {
    const s = new Scratch(env(new FakeDir(), null, { quota: 1000, usage: 400 }).e);
    expect(await s.hasRoom(600)).toBe(true);
    expect(await s.hasRoom(601)).toBe(false);
    const none = new Scratch({ ...env(new FakeDir(), null).e, storage: null });
    expect(await none.hasRoom(1)).toBe(false);
    expect(none.available).toBe(false);
  });

  it('ADR-0010 outcome item 5 writes reach the file in batches of at least 1 MB, and a back-patch flushes first', () => {
    const out: [number, number][] = [];
    const b = new BatchingSink((chunk, at) => void out.push([at, chunk.length]));
    for (let i = 0; i < 40; i++) b.write(new Uint8Array(100_000), i * 100_000);
    b.write(new Uint8Array(8), 0); // the writer patches a box size at the start
    b.close();
    expect(out.slice(0, 3)).toEqual([
      [0, BATCH_BYTES],
      [BATCH_BYTES, BATCH_BYTES],
      [2 * BATCH_BYTES, BATCH_BYTES],
    ]);
    expect(out.at(-2)).toEqual([3 * BATCH_BYTES, 4_000_000 - 3 * BATCH_BYTES]);
    expect(out.at(-1)).toEqual([0, 8]);
  });

  it('ADR-0010 outcome item 1 the spill file returns what was appended and is deleted with discard', async () => {
    const dir = new FakeDir();
    const spill = await openScratchSpill('export-me1-s.part', env(dir, null).storage);
    const a = spill.append(new Uint8Array([1, 2, 3]));
    const b = spill.append(new Uint8Array([4, 5]));
    expect([...spill.read(b, 2)]).toEqual([4, 5]);
    expect([...spill.read(a, 3)]).toEqual([1, 2, 3]);
    expect(spill.bytes).toBe(5);
    await spill.discard();
    expect(dir.files.size).toBe(0);
  });

  it('INV-01 discarding an export deletes its file and its spill file', async () => {
    const dir = new FakeDir();
    const s = new Scratch(env(dir, null).e);
    const f = s.create();
    dir.files.set(f.name, new Uint8Array(1));
    dir.files.set(f.spill, new Uint8Array(1));
    await f.discard();
    expect(dir.files.size).toBe(0);
  });

  it('INV-01 a scratch sink writes positioned bytes and discard closes the handle before deleting', async () => {
    const dir = new FakeDir();
    const { storage } = env(dir, null);
    const sink = await openScratchSink('export-me1-a.part', storage);
    sink.write(new Uint8Array([1, 2, 3, 4]), 0);
    sink.write(new Uint8Array([9]), 1);
    sink.close();
    expect([...dir.files.get('export-me1-a.part')!]).toEqual([1, 9, 3, 4]);
    const again = await openScratchSink('export-me1-b.part', storage);
    again.write(new Uint8Array(10), 0);
    await again.discard();
    expect(dir.files.has('export-me1-b.part')).toBe(false);
  });
});
