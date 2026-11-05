// Test support for MOD-Engine: a fake container track (packets on a frame grid with keyframes every
// `gop`), a fake WebCodecs decoder (optionally holding frames back like WebKit, or slow), fake frames
// that count how many are open, and a fake compositor that records paints.
import type { FramePlan } from '../../src/plan';
import type { Compositor, PaintFrame } from '../../src/compositor';
import { DecoderSlot, type DecoderFactory, type PacketLike, type TrackReader } from '../../src/engine';

export class FakeFrame {
  static open = 0;
  closed = false;
  readonly displayWidth = 640;
  readonly displayHeight = 360;
  constructor(readonly timestamp: number) {
    FakeFrame.open++;
  }
  close(): void {
    if (!this.closed) FakeFrame.open--;
    this.closed = true;
  }
  clone(): FakeFrame {
    return new FakeFrame(this.timestamp);
  }
}

export interface TrackOptions {
  /** Frames per second of the source. */
  readonly rate: number;
  readonly frames: number;
  /** Keyframe every `gop` frames. */
  readonly gop: number;
  /** Presentation-time offset of every packet, µs (negative = an edit list trims the start). */
  readonly offsetUs?: number;
  /** Packets that follow each key packet in decode order but present before it (open GOP). */
  readonly leading?: number;
}

const us = (k: number, o: TrackOptions): number => Math.floor((k * 1_000_000) / o.rate) + (o.offsetUs ?? 0);

/** Packets in decode order; `leading` adds open-GOP leading pictures after every key but the first. */
export function fakePackets(o: TrackOptions): PacketLike[] {
  const out: PacketLike[] = [];
  for (let k = 0; k < o.frames; k++) {
    const key = k % o.gop === 0;
    out.push({ timestamp: us(k, o) / 1e6, duration: 1 / o.rate, key, data: new Uint8Array(1) });
    if (key && k > 0 && o.leading)
      for (let j = o.leading; j >= 1; j--)
        out.push({ timestamp: (us(k, o) - j * 1000) / 1e6, duration: 0, key: false, data: new Uint8Array(1) });
  }
  return out;
}

export function fakeTrack(o: TrackOptions): TrackReader & { packets_: PacketLike[] } {
  const all = fakePackets(o);
  const byTime = all.filter((p) => p.duration > 0); // leading pictures are not on the index grid
  return {
    packets_: all,
    async packetAt(t) {
      let best: PacketLike | null = null;
      for (const p of byTime) if (p.timestamp <= t + 2e-6) best = p;
      return best;
    },
    async keyPacketAt(t) {
      let best: PacketLike | null = null;
      for (const p of byTime) if (p.key && p.timestamp <= t) best = p;
      return best ?? byTime[0] ?? null;
    },
    packets(from) {
      const start = all.findIndex((p) => p.key && Math.abs(p.timestamp - from) < 1e-9);
      let i = Math.max(0, start);
      return {
        async next() {
          if (i >= all.length) return { done: true, value: undefined };
          return { done: false, value: all[i++]! };
        },
      };
    },
  };
}

export interface DecoderOptions {
  /** Packets kept inside the decoder before it outputs (WebKit holds frames back). */
  readonly holdBack?: number;
  /** Delay before each output, ms (a slow decoder). */
  readonly delayMs?: number;
}

export interface DecoderLog {
  decoded: number[];
  restarts: number;
  flushes: number;
}

export function fakeDecoder(
  o: DecoderOptions = {},
  log: DecoderLog = { decoded: [], restarts: 0, flushes: 0 },
): DecoderFactory<FakeFrame> {
  return (output) => {
    let queue: number[] = [];
    let state = 'configured';
    const emit = (): void => {
      const ts = queue.shift();
      if (ts === undefined) return;
      const f = new FakeFrame(ts);
      if (o.delayMs) setTimeout(() => output(f), o.delayMs);
      else queueMicrotask(() => output(f));
    };
    return {
      get state() {
        return state;
      },
      get decodeQueueSize() {
        return Math.max(0, queue.length - (o.holdBack ?? 0));
      },
      decode(p) {
        const ts = Math.round(p.timestamp * 1e6);
        log.decoded.push(ts);
        queue.push(ts);
        queue.sort((a, b) => a - b);
        while (queue.length > (o.holdBack ?? 0)) emit();
      },
      async flush() {
        log.flushes++;
        while (queue.length) emit();
        await new Promise((r) => setTimeout(r, (o.delayMs ?? 0) + 1));
      },
      restart() {
        log.restarts++;
        queue = [];
      },
      close() {
        state = 'closed';
        queue = [];
      },
    };
  };
}

export function fakeSlot(track: TrackOptions, dec: DecoderOptions = {}, log?: DecoderLog): DecoderSlot<FakeFrame> {
  return new DecoderSlot<FakeFrame>(fakeTrack(track), fakeDecoder(dec, log), 1_000_000 / track.rate, (f) => f.clone());
}

/** The frame index of a source frame timestamp on a `rate` grid. */
export const indexOf = (ts: number, rate: number): number => Math.round((ts * rate) / 1_000_000);

export interface PaintRecord {
  readonly frameIndex: number;
  readonly frames: readonly (number | null)[];
  readonly compare: string | null | undefined;
  readonly texts: number;
}

/** A compositor that records paints; `loseContext()` fires the loss handlers. */
export class FakeCompositor implements Compositor {
  paints: PaintRecord[] = [];
  overlays = 0;
  looks = 0;
  lostNow = false;
  recoverOk = true;
  width = 640;
  height = 360;
  readonly halfFloat = true;
  private handlers = new Set<() => void>();
  get lost(): boolean {
    return this.lostNow;
  }
  paint(
    plan: FramePlan,
    frames: readonly (PaintFrame | null)[],
    texts?: ReadonlyMap<string, unknown>,
    o?: { compare?: string | null },
  ) {
    this.paints.push({
      frameIndex: plan.frameIndex,
      frames: frames.map((f) => (f ? ((f.image as unknown as { timestamp?: number }).timestamp ?? -1) : null)),
      compare: o?.compare,
      texts: texts?.size ?? 0,
    });
    return {} as ReturnType<Compositor['paint']>;
  }
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
  setLooks(): void {
    this.looks++;
  }
  paintOverlay(): void {
    this.overlays++;
  }
  onContextLost(h: () => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  loseContext(): void {
    this.lostNow = true;
    for (const h of this.handlers) h();
  }
  async recover(): Promise<void> {
    await new Promise((r) => setTimeout(r, 1));
    if (!this.recoverOk) throw new Error('lost');
    this.lostNow = false;
  }
  sync(): void {}
  readPixels(): Uint8Array {
    return new Uint8Array(0);
  }
  dispose(): void {}
}
