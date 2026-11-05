// MOD-Engine — one video decoder with its decode-ahead feed and bounded frame list (ADR-0009 §3–4 and
// outcome rules 1–6), promoted from SP-compositor / SP-mem-hdr `DecoderSlot`. The decoder and the
// packet reader are injected, so the scheduling is unit-tested with fakes and runs on WebCodecs and
// MOD-Container in the worker.
// Implements: F-002.R1/R3 (the exact frame for a source time; coarse-then-exact seeks), NFR-03,
// NFR-05 (≤ 12 frames held, frames closed as soon as they are evicted).
import type { Micros } from '../core';
import {
  COARSE_AFTER_FRAMES,
  EPSILON_US,
  evictionIndex,
  insertionIndex,
  isLeadingPicture,
  MAX_FRAMES,
  needsRestart,
  newestAtOrBefore,
  pickFrame,
  wantsFeed,
  type FrameMode,
} from './frames';

/** One encoded packet (MOD-Container `Packet`), times in seconds. */
export interface PacketLike {
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
  readonly data: Uint8Array;
}

/** The part of MOD-Container's `OpenedInput` a decoder reads (video track). */
export interface TrackReader {
  packetAt(t: number): Promise<PacketLike | null>;
  keyPacketAt(t: number): Promise<PacketLike | null>;
  /** Packets in decode order from the key packet at or before `from` seconds. */
  packets(from: number): AsyncIterator<PacketLike>;
}

export interface DecodedFrame {
  readonly timestamp: number;
  close(): void;
}

/** The part of a WebCodecs `VideoDecoder` the slot drives. */
export interface DecoderLike {
  readonly state: string;
  readonly decodeQueueSize: number;
  decode(packet: PacketLike): void;
  flush(): Promise<void>;
  /** `reset()` then `configure()` with the same configuration. */
  restart(): void;
  close(): void;
}

export type DecoderFactory<F extends DecodedFrame> = (output: (f: F) => void, error: (e: Error) => void) => DecoderLike;

/** How long a playing tick waits for the exact frame before showing the newest one (outcome rule 6). */
export const PLAY_WAIT_MS = 20;
/** Polls without progress before the decoder is flushed (WebKit holds frames back). */
const IDLE_POLLS = 3;
const POLL_MS = 15;

const toUs = (s: number): Micros => Math.round(s * 1_000_000);

export interface FrameResult<F> {
  readonly frame: F | null;
  readonly exact: boolean;
  readonly restarted: boolean;
}

export interface SlotStats {
  restarts: number;
  flushes: number;
  fed: number;
  skippedLeading: number;
}

export class DecoderSlot<F extends DecodedFrame> {
  /** Decoded frames in presentation order, at most `max`. */
  frames: F[] = [];
  readonly stats: SlotStats = { restarts: 0, flushes: 0, fed: 0, skippedLeading: 0 };
  /** Called with each decoded frame before it is stored (the coarse cache takes copies). */
  onFrame: ((f: F) => void) | null = null;

  private decoder: DecoderLike | null = null;
  private iter: AsyncIterator<PacketLike> | null = null;
  private next: PacketLike | null = null;
  private needKey = true;
  private lastFedTs = -Infinity;
  private maxOutTs = -Infinity;
  private skipBefore: number | null = null;
  private target = -Infinity;
  private pinned: F | null = null;
  private coarseWanted = false;
  private coarse: F | null = null;
  private error: Error | null = null;
  private waiters: (() => void)[] = [];
  /** Packets fed since the last restart or flush that have not come out yet. */
  private inFlight = 0;
  private lock: Promise<unknown> = Promise.resolve();
  private gen = 0;

  constructor(
    readonly reader: TrackReader,
    private readonly makeDecoder: DecoderFactory<F>,
    private readonly frameUs: number,
    private readonly clone: (f: F) => F,
    private readonly max = MAX_FRAMES,
    private readonly now: () => number = () => performance.now(),
  ) {}

  private ensureDecoder(): DecoderLike {
    if (this.decoder && this.decoder.state !== 'closed' && !this.error) return this.decoder;
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.error = null;
    this.decoder = this.makeDecoder(
      (f) => this.onOutput(f),
      (e) => {
        this.error = e;
        this.wake();
      },
    );
    this.needKey = true;
    return this.decoder;
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private onOutput(f: F): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    // Edit lists arrive as negative timestamps; frames before 0 are dropped (outcome rule 1).
    if (f.timestamp < 0) {
      f.close();
      return;
    }
    this.maxOutTs = Math.max(this.maxOutTs, f.timestamp);
    this.onFrame?.(f);
    if (this.coarseWanted && !this.coarse) this.coarse = this.clone(f);
    this.frames.splice(insertionIndex(this.frames, f.timestamp), 0, f);
    while (this.frames.length > this.max) {
      const i = evictionIndex(this.frames, this.target, this.pinned);
      if (i < 0) break;
      this.frames.splice(i, 1)[0]!.close();
    }
    this.wake();
  }

  private clear(): void {
    for (const f of this.frames) if (f !== this.pinned) f.close();
    this.frames = this.pinned ? [this.pinned] : [];
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.lock.then(fn, fn);
    this.lock = p.catch(() => undefined);
    return p;
  }

  private async restart(key: PacketLike): Promise<void> {
    this.ensureDecoder().restart();
    this.clear();
    this.pinned = null;
    this.iter = this.reader.packets(key.timestamp);
    const first = await this.iter.next();
    this.next = first.done ? null : first.value;
    this.skipBefore = toUs(key.timestamp);
    this.needKey = false;
    this.lastFedTs = -Infinity;
    this.maxOutTs = -Infinity;
    this.inFlight = 0;
    this.stats.restarts++;
  }

  private async feed(): Promise<void> {
    const p = this.next;
    if (!p || !this.iter) return;
    const ts = toUs(p.timestamp);
    if (this.skipBefore !== null) {
      if (isLeadingPicture(ts, this.skipBefore)) {
        this.stats.skippedLeading++;
        const n = await this.iter.next();
        this.next = n.done ? null : n.value;
        return;
      }
      if (ts > this.skipBefore) this.skipBefore = null;
    }
    this.ensureDecoder().decode(p);
    this.lastFedTs = Math.max(this.lastFedTs, ts);
    this.stats.fed++;
    this.inFlight++;
    const n = await this.iter.next();
    this.next = n.done ? null : n.value;
  }

  /** Frames at or ahead of `t`, decoded or still inside the decoder. */
  private ahead(t: Micros): number {
    let n = this.inFlight;
    for (const f of this.frames) if (f.timestamp >= t - EPSILON_US) n++;
    return n;
  }

  private async wait(): Promise<void> {
    await Promise.race([new Promise<void>((r) => this.waiters.push(r)), new Promise((r) => setTimeout(r, POLL_MS))]);
  }

  /** The presentation time of the frame shown at source time `t` (from the container index). */
  private async wanted(t: Micros): Promise<{ want: Micros; key: PacketLike | null }> {
    const s = t / 1_000_000;
    const [p, key] = await Promise.all([this.reader.packetAt(s), this.reader.keyPacketAt(s)]);
    const at = p ?? key;
    return { want: at ? toUs(at.timestamp) : 0, key };
  }

  /** Keeps the returned frame alive until the next request (no eviction closes it mid-paint). */
  private hit(frame: F | null, exact: boolean, restarted: boolean): FrameResult<F> {
    this.pinned = frame;
    return { frame, exact, restarted };
  }

  /**
   * The frame shown at source time `t`. 'exact' (seek, scrub, paused, export) waits for it; 'play'
   * waits at most PLAY_WAIT_MS and otherwise returns the newest decoded frame (outcome rule 6).
   * `onCoarse` gets one copy of the first frame decoded after a keyframe restart when the target lies
   * well past the keyframe (coarse-then-exact, outcome rule 4); the caller closes it.
   */
  frameAt(t: Micros, mode: FrameMode = 'exact', onCoarse?: (f: F) => void): Promise<FrameResult<F>> {
    const gen = ++this.gen;
    return this.withLock(async () => {
      this.pinned = null; // the previous result has been painted
      this.target = t;
      const { want, key } = await this.wanted(t);
      this.target = want;
      const cached = pickFrame(this.frames, want);
      if (cached) return this.hit(cached, true, false);
      if (!key) return this.hit(newestAtOrBefore(this.frames, want), false, false);
      const keyTs = toUs(key.timestamp);
      const d = this.decoder;
      const restarted = needsRestart(
        {
          configured: !!d && d.state === 'configured' && !this.error,
          needKey: this.needKey,
          lastFedTs: this.lastFedTs,
          maxOutTs: this.maxOutTs,
          hasNext: this.next !== null,
          nextTs: this.next ? toUs(this.next.timestamp) : Infinity,
        },
        want,
        keyTs,
        mode,
      );
      if (restarted) {
        await this.restart(key);
        this.coarseWanted = !!onCoarse && want - keyTs > COARSE_AFTER_FRAMES * this.frameUs;
        this.coarse = null;
      }
      const started = this.now();
      let idle = 0;
      try {
        for (;;) {
          const hit = pickFrame(this.frames, want);
          if (hit) return this.hit(hit, true, restarted);
          if (this.error) throw this.error;
          if (this.coarse && onCoarse) {
            const c = this.coarse;
            this.coarse = null;
            this.coarseWanted = false;
            onCoarse(c);
          }
          if (mode === 'play' && (this.now() - started >= PLAY_WAIT_MS || gen !== this.gen))
            return this.hit(newestAtOrBefore(this.frames, want), false, restarted);
          const dec = this.ensureDecoder();
          if (
            this.next &&
            wantsFeed(this.lastFedTs, want, this.frameUs, dec.decodeQueueSize, this.ahead(want), this.max)
          ) {
            await this.feed();
            continue;
          }
          const before = this.maxOutTs;
          await this.wait();
          if (this.maxOutTs === before && dec.decodeQueueSize === 0) idle++;
          else idle = 0;
          // Out of packets, or the decoder holds frames back: flush (a keyframe is needed afterwards).
          if (idle >= IDLE_POLLS || (!this.next && dec.decodeQueueSize === 0 && idle >= 1)) {
            await dec.flush().catch((e: unknown) => {
              this.error = e instanceof Error ? e : new Error(String(e));
            });
            this.needKey = true;
            this.inFlight = 0;
            this.stats.flushes++;
            const got = pickFrame(this.frames, want);
            return this.hit(got ?? newestAtOrBefore(this.frames, want), got !== null, restarted);
          }
        }
      } finally {
        this.coarseWanted = false;
        if (this.coarse) {
          this.coarse.close();
          this.coarse = null;
        }
      }
    });
  }

  /** Decode ahead while playing: keep feeding up to FEED_AHEAD frames past `t`; yields to new requests. */
  prefetch(t: Micros): Promise<void> {
    const gen = this.gen;
    return this.withLock(async () => {
      while (gen === this.gen && this.next && !this.needKey && !this.error && this.decoder?.state === 'configured') {
        if (!wantsFeed(this.lastFedTs, t, this.frameUs, this.decoder.decodeQueueSize, this.ahead(t), this.max)) break;
        await this.feed();
      }
    });
  }

  /** Any decoded frame near `t` without decoding (a coarse paint). */
  peek(t: Micros): F | null {
    return this.frames.length ? newestAtOrBefore(this.frames, t + EPSILON_US) : null;
  }

  /** Ends a cross-clip use: flush happens at clip ends and seeks only (outcome rule 3). */
  close(): void {
    this.gen++;
    for (const f of this.frames) f.close();
    this.frames = [];
    this.pinned = null;
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.needKey = true;
    this.next = null;
    this.iter = null;
  }

  get openFrames(): number {
    return this.frames.length;
  }
}
