// MOD-Audio — windowed decoding of the sources' sound (ADR-0008 §2/§6 and outcome item 5), shared by the
// audio worker (preview) and the export-audio worker (exports).
// Encoded packets arrive in pieces over the sound feed (MOD-Core; read by MOD-Container in the worker
// that has the reader), are decoded with `AudioDecoder` (MOD-Codec), mapped to stereo by fixed rules
// and resampled to 48 kHz. The mixer says which source ranges it will read (`soundDemand`); `want`
// keeps exactly those decoded (callers add ≈ 2 s ahead and a 1 s back-buffer) and frees the rest, so
// memory follows the demand, never the source length (NFR-05). Each contiguous range is decoded by
// one cursor (≈ one per active voice); a range far from every cursor (a seek, a split clip's other
// half) gets its own, which starts 0.1 s before the range so the codec has settled (pre-roll), or at
// the track's first packet. Samples before the track's time 0 (the AAC priming that an input edit list
// removes, ADR-0008 outcome item 3) are silent, so the sound lines up with the picture (INV-02).
// Implements: ADR-0008 §2/§6, F-002.R2 (sound with picture), F-005.R3 (via the mixer), INV-02, NFR-05.
import type { FeedPacket, FeedReply, FeedRequest } from '../core';
import { createAudioDecoder, withNormalisedDescription } from '../codec';
import { SAMPLE_RATE } from '../plan';
import type { Voice } from '../plan';
import { MIX_LATENCY_MARGIN, soundDemand, type Demand } from './demand';
import { Resampler } from './resample';
import type { SoundSource } from './source';
import { toStereo } from './stereo';

/** Decoded sound kept ahead of the play position per active voice (ADR-0008 §6: ≈ 2 s). */
export const DECODE_AHEAD = 2 * SAMPLE_RATE;
/** Decoded sound kept behind it (the limiter's 1 s pre-roll after a seek doubles as the back-buffer). */
export const DECODE_BACK = SAMPLE_RATE;
/** A new cursor starts this long before its range so the codec state has settled (Opus needs 80 ms). */
export const CODEC_PREROLL_S = 0.12;
/** …and this much more for the resampler's support (32 taps at 8 kHz is 4 ms). */
const RESAMPLE_PAD_S = 0.01;
/**
 * A cursor whose first valid sample is at most this far after a range's start still serves it (silence
 * before): a decoder whose first output comes later than its packet must not make a range unservable.
 */
const START_SLACK = Math.round(0.05 * SAMPLE_RATE);
/** Ranges of one source closer than this are decoded by one cursor. */
const MERGE_GAP = SAMPLE_RATE;
/** A cursor whose decoded end is at most this far before a range goes on decoding to it (no seek). */
const REUSE_GAP = 2 * SAMPLE_RATE;
/** Packets fed beyond the target (decoders hold back a packet or two). */
const FEED_PAD_S = 0.25;
/** Decode queue cap before waiting. */
const QUEUE_CAP = 16;
/** Storage granularity (samples per chunk, both channels): 64 KB. */
export const CHUNK = 8192;
/** At most this many cursors per source (more ranges than this are never asked for). */
const MAX_CURSORS = 8;

// ---------------------------------------------------------------------------------------------------
// The sound feed client.

export interface FeedBatch {
  readonly config?: AudioDecoderConfig | null;
  readonly first?: boolean;
  readonly start?: number;
  readonly packets: readonly FeedPacket[];
  readonly done: boolean;
}

/** One source's packets from a time on, batch by batch. */
export interface FeedStream {
  next(): Promise<FeedBatch>;
  close(): void;
}

export interface SoundFeed {
  open(sourceId: string, from: number): FeedStream;
}

export interface FeedClientPort {
  postMessage(m: FeedRequest): void;
  onmessage: ((e: MessageEvent<FeedReply>) => void) | null;
  start?(): void;
}

/** The sound feed over a MessagePort to MOD-Container's `serveSound`. */
export function portFeed(port: FeedClientPort): SoundFeed {
  let ids = 0;
  const waiting = new Map<number, { ok: (b: FeedBatch) => void; fail: (e: Error) => void }>();
  port.onmessage = (e) => {
    const m = e.data;
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === 'error') w.fail(new Error(m.message));
    else w.ok(m);
  };
  port.start?.();
  return {
    open(sourceId, from) {
      const id = ++ids;
      let opened = false;
      let closed = false;
      return {
        next: () =>
          new Promise<FeedBatch>((ok, fail) => {
            if (closed) return fail(new Error('AbortError: closed'));
            waiting.set(id, { ok, fail });
            port.postMessage(opened ? { type: 'more', id } : { type: 'open', id, sourceId, from });
            opened = true;
          }),
        close: () => {
          if (closed) return;
          closed = true;
          waiting.get(id)?.fail(new Error('AbortError: closed'));
          waiting.delete(id);
          if (opened) port.postMessage({ type: 'close', id });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// The decoder.

/** A configured decoder of one stream (WebCodecs in the workers; fakes in tests). */
export interface PcmDecoder {
  decode(p: FeedPacket): void;
  flush(): Promise<void>;
  close(): void;
  readonly queue: number;
  /** Resolves when the queue moved (or soon). */
  drained(): Promise<void>;
}

/** Creates a decoder; null when the configuration is not supported (the source stays silent). */
export type DecoderFactory = (
  config: AudioDecoderConfig,
  output: (planes: Float32Array[], sampleRate: number, timestampUs: number) => void,
  error: (message: string) => void,
) => Promise<PcmDecoder | null>;

const errorText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);

/** `AudioDecoder` via MOD-Codec (AAC descriptions normalised); planes copied out as float32. */
export const webDecoders: DecoderFactory = async (config, output, error) => {
  const cfg = withNormalisedDescription(config);
  try {
    if (!(await AudioDecoder.isConfigSupported(cfg)).supported) return null;
  } catch {
    return null;
  }
  const dec = createAudioDecoder(
    cfg,
    (a) => {
      try {
        const planes: Float32Array[] = [];
        for (let c = 0; c < a.numberOfChannels; c++) {
          const p = new Float32Array(a.numberOfFrames);
          a.copyTo(p, { planeIndex: c, format: 'f32-planar' });
          planes.push(p);
        }
        output(planes, a.sampleRate, a.timestamp);
      } finally {
        a.close();
      }
    },
    (e) => error(errorText(e)),
  );
  return {
    decode: (p) =>
      dec.decode(
        new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(p.t * 1e6),
          duration: Math.round(p.d * 1e6),
          data: p.data,
        }),
      ),
    flush: () => dec.flush(),
    close: () => {
      if (dec.state !== 'closed') dec.close();
    },
    get queue() {
      return dec.decodeQueueSize;
    },
    drained: () =>
      new Promise<void>((r) => {
        const t = setTimeout(r, 50);
        dec.addEventListener(
          'dequeue',
          () => {
            clearTimeout(t);
            r();
          },
          { once: true },
        );
      }),
  };
};

// ---------------------------------------------------------------------------------------------------
// Cursors and windowed sources.

/** A sequential decode of one source from a start, holding its 48 kHz output in chunks. */
class Cursor {
  /** First valid 48 kHz sample (−∞: decoded from the track's start, silence before it). */
  start = Number.POSITIVE_INFINITY;
  /** Decoded up to (exclusive). */
  end = Number.NEGATIVE_INFINITY;
  /** The track ended: silence after `end`. */
  done = false;
  closed = false;
  target: number;
  keepFrom: number;
  private readonly chunks = new Map<number, [Float32Array, Float32Array]>();
  private wake: (() => void) | null = null;

  constructor(
    private readonly owner: WindowedSource,
    readonly from: number,
    to: number,
  ) {
    this.target = to;
    this.keepFrom = from;
    void this.run();
  }

  get bytes(): number {
    return this.chunks.size * CHUNK * 8;
  }

  /** Holds [from, to): nothing below `keepFrom` is kept (it was freed or never stored). */
  covers(from: number, to: number): boolean {
    return this.keepFrom <= from && this.start <= from + START_SLACK && (this.done || this.end >= to);
  }

  /**
   * Could go on to serve [from, …) without a seek: never below what it keeps (freed samples would read
   * as silence); a window still waiting for its first output serves ranges starting near its own.
   */
  reaches(from: number): boolean {
    if (from < this.keepFrom) return false;
    if (this.start === Number.POSITIVE_INFINITY) return !this.done && from <= this.from + REUSE_GAP;
    return this.start <= from + START_SLACK && (this.done || from <= Math.max(this.end, this.from) + REUSE_GAP);
  }

  retarget(from: number, to: number): void {
    this.target = to;
    this.keepFrom = from;
    for (const k of [...this.chunks.keys()]) if ((k + 1) * CHUNK <= from) this.chunks.delete(k);
    this.wake?.();
  }

  close(): void {
    this.closed = true;
    this.chunks.clear();
    this.wake?.();
  }

  /** Adds L/R starting at 48 kHz sample `at` (only what is kept). */
  private store(at: number, L: Float32Array, R: Float32Array): void {
    let i = Math.max(0, this.keepFrom - at, this.start - at);
    while (i < L.length) {
      const k = Math.floor((at + i) / CHUNK);
      let c = this.chunks.get(k);
      if (!c) {
        c = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
        this.chunks.set(k, c);
      }
      const o = at + i - k * CHUNK;
      const n = Math.min(CHUNK - o, L.length - i);
      c[0].set(L.subarray(i, i + n), o);
      c[1].set(R.subarray(i, i + n), o);
      i += n;
    }
  }

  /** Copies its part of [from, from + outL.length) into outL/outR. */
  read(from: number, outL: Float32Array, outR: Float32Array): void {
    const a = Math.max(from, this.start);
    const b = Math.min(from + outL.length, this.end);
    for (let s = a; s < b;) {
      const k = Math.floor(s / CHUNK);
      const o = s - k * CHUNK;
      const n = Math.min(CHUNK - o, b - s);
      const c = this.chunks.get(k);
      if (c) {
        outL.set(c[0].subarray(o, o + n), s - from);
        outR.set(c[1].subarray(o, o + n), s - from);
      }
      s += n;
    }
  }

  private async run(): Promise<void> {
    const bank = this.owner.bank;
    // From the track's first packet when the range starts near time 0 (−∞: the priming packets too).
    const at = this.from / SAMPLE_RATE - CODEC_PREROLL_S - RESAMPLE_PAD_S;
    const stream = bank.feed.open(this.owner.id, at <= 0 ? Number.NEGATIVE_INFINITY : at);
    let dec: PcmDecoder | null = null;
    try {
      let batch = await stream.next();
      if (this.closed) return;
      if (!batch.config) return this.owner.silence();
      const first = batch.first === true;
      // A cursor from the track's first packet decodes as from 0; otherwise the codec settles first.
      const validFromS = first ? Number.NEGATIVE_INFINITY : (batch.packets[0]?.t ?? 0) + CODEC_PREROLL_S;
      let rs: Resampler | null = null;
      let failure: string | null = null;
      // Decoded samples are placed by counting from the first packet, never by the decoders' output
      // timestamps: Chromium re-stamps outputs from 0 (ignoring an edit list's negative times) and
      // WebKit keeps packet times after trimming Opus pre-skip (build question 84). A decoder that drops
      // frames from its first output (Opus pre-skip) is detected by the shortfall against the packet.
      const p0 = batch.packets[0];
      // The pre-skip is subtracted only when the container did not already put the track's first
      // packet before time 0 (an edit list does that; WebM and Ogg as mediabunny reads them do not).
      const preSkip =
        batch.config.codec === 'opus' && (batch.start ?? 0) >= 0 ? opusPreSkip(batch.config.description) : 0;
      let next: number | null = null;
      dec = await bank.decoders(
        batch.config,
        (planes, rate) => {
          if (this.closed) return;
          const frames = planes[0]?.length ?? 0;
          if (next === null) {
            const expected = p0 ? Math.round(p0.d * rate) : 0;
            next = Math.round((p0?.t ?? 0) * rate) - preSkip + Math.max(0, expected - frames);
          }
          const n0 = next;
          next += frames;
          if (!rs || rs.rateIn !== rate) {
            rs = new Resampler(rate);
            const k0 = first ? 0 : rs.firstOutputFrom(Math.ceil(validFromS * rate));
            rs.next = Math.max(k0, 0);
            this.start = first ? Number.NEGATIVE_INFINITY : rs.next;
            this.end = rs.next;
          }
          let [L, R] = toStereo(planes);
          if (n0 < 0) {
            // Before the track's time 0 (encoder priming removed by the edit list): silent.
            const z = Math.min(L.length, -n0);
            L = L.slice();
            R = R === planes[0] && planes.length === 1 ? L : R.slice();
            L.fill(0, 0, z);
            R.fill(0, 0, z);
          }
          rs.push(n0, L, R);
          this.emit(rs.produce());
        },
        (m) => (failure ??= m),
      );
      if (!dec) {
        if (bank.strict) throw new Error(`NotSupportedError: ${batch.config.codec} can't be decoded here`);
        return this.owner.silence();
      }
      let fed = 0;
      for (;;) {
        if (failure) throw new Error(failure);
        for (const p of batch.packets) {
          dec.decode(p);
          fed = p.t + p.d;
        }
        if (failure) throw new Error(failure);
        if (batch.done) {
          await dec.flush();
          if (failure) throw new Error(failure);
          const r = rs as Resampler | null;
          if (r) {
            r.end();
            this.emit(r.produce());
          }
          this.done = true;
          if (!r) this.start = first ? Number.NEGATIVE_INFINITY : this.from;
          bank.progress();
          return;
        }
        while (!this.closed && fed * SAMPLE_RATE >= this.target + FEED_PAD_S * SAMPLE_RATE)
          await new Promise<void>((r) => (this.wake = r));
        while (!this.closed && dec.queue > QUEUE_CAP) await dec.drained();
        if (this.closed) return;
        batch = await stream.next();
        if (this.closed) return;
      }
    } catch (e) {
      if (!this.closed) this.owner.fail(errorText(e));
    } finally {
      stream.close();
      dec?.close();
    }
  }

  private emit(out: { from: number; L: Float32Array; R: Float32Array } | null): void {
    if (!out || this.closed) return;
    this.owner.stalled = false;
    this.store(out.from, out.L, out.R);
    this.end = out.from + out.L.length;
    this.owner.bank.progress();
  }
}

/** The Opus pre-skip (encoder delay) from an OpusHead description: samples before the track's time 0. */
export function opusPreSkip(description: AllowSharedBufferSource | undefined): number {
  if (!description) return 0;
  const b = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  const head = String.fromCharCode(...b.subarray(0, 8));
  return head === 'OpusHead' && b.length >= 12 ? b[10]! | (b[11]! << 8) : 0;
}

/** One source's sound as the mixer reads it: what its cursors hold, silence elsewhere. */
export class WindowedSource implements SoundSource {
  readonly length = Number.POSITIVE_INFINITY;
  cursors: Cursor[] = [];
  /** No sound to decode (no track, codec not supported): heard as silence, never waited for. */
  silent = false;
  /** A decode error (`name: message`): heard as silence; exports fail on it. */
  failure: string | null = null;
  /** Given up on by the preview after STALL_MS: heard as silence until it decodes again or a new window opens. */
  stalled = false;

  constructor(
    readonly bank: SoundBank,
    readonly id: string,
  ) {}

  read(from: number, L: Float32Array, R: Float32Array): void {
    L.fill(0);
    R.fill(0);
    for (const c of this.cursors) c.read(from, L, R);
  }

  get bytes(): number {
    return this.cursors.reduce((s, c) => s + c.bytes, 0);
  }

  ready(from: number, to: number): boolean {
    return this.silent || this.stalled || this.failure !== null || this.cursors.some((c) => c.covers(from, to));
  }

  silence(): void {
    this.silent = true;
    this.drop();
    this.bank.progress();
  }

  fail(message: string): void {
    this.failure = message;
    this.drop();
    this.bank.progress();
  }

  drop(): void {
    for (const c of this.cursors) c.close();
    this.cursors = [];
  }

  /** Keeps cursors for exactly these ranges (sorted, merged), closing the rest. */
  want(ranges: readonly [number, number][]): void {
    if (this.silent || this.failure) return;
    const left = new Set(this.cursors);
    const next: Cursor[] = [];
    for (const [from, to] of fewest(ranges, MAX_CURSORS)) {
      let best: Cursor | null = null;
      for (const c of left) if (c.reaches(from) && (!best || c.end > best.end)) best = c;
      if (best) {
        left.delete(best);
        best.retarget(from, to);
        next.push(best);
      } else {
        this.stalled = false;
        next.push(new Cursor(this, from, to));
      }
    }
    for (const c of left) c.close();
    this.cursors = next;
  }
}

/** At most `max` ranges: the two with the smallest gap between them are joined until it fits. */
export function fewest(ranges: readonly [number, number][], max: number): [number, number][] {
  const out = ranges.map((r): [number, number] => [r[0], r[1]]);
  while (out.length > max) {
    let k = 0;
    for (let i = 1; i < out.length - 1; i++) if (out[i + 1]![0] - out[i]![1] < out[k + 1]![0] - out[k]![1]) k = i;
    out[k]![1] = Math.max(out[k]![1], out[k + 1]![1]);
    out.splice(k + 1, 1);
  }
  return out;
}

/** The longest an export's mix waits for one block's decoded sound. */
export const SOUND_WAIT_MS = 20_000;

/**
 * An offline mix's `prepare` (exports, ADR-0008 §6): before mixing project samples [from, to) it keeps
 * them and ≈ 2 s ahead decoded and waits for them (at most `ms`). A pass that starts again from an
 * earlier sample (verify-and-trim) first frees every window, so it decodes from its start. A decode
 * error is thrown through `fail`.
 */
export function offlinePrepare(
  bank: SoundBank,
  voices: readonly Voice[],
  fail: (message: string) => Error,
  ms = SOUND_WAIT_MS,
): (from: number, to: number) => Promise<void> {
  let last = Number.POSITIVE_INFINITY;
  return async (from, to) => {
    if (from < last) bank.want([]);
    last = from;
    bank.want(soundDemand(voices, from - MIX_LATENCY_MARGIN, to + MIX_LATENCY_MARGIN + DECODE_AHEAD));
    const need = soundDemand(voices, from - MIX_LATENCY_MARGIN, to + MIX_LATENCY_MARGIN);
    await bank.until(need, ms);
    const failure = bank.failureOf(need);
    if (failure) throw fail(`AudioDecodeError: ${failure}`);
  };
}

/** Merges each source's demanded ranges (sorted; gaps under MERGE_GAP joined). */
export function mergeDemand(demand: readonly Demand[]): Map<string, [number, number][]> {
  const by = new Map<string, [number, number][]>();
  for (const d of demand) {
    const list = by.get(d.sourceId) ?? [];
    list.push([d.from, d.to]);
    by.set(d.sourceId, list);
  }
  for (const [id, list] of by) {
    list.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const r of list) {
      const last = out.at(-1);
      if (last && r[0] <= last[1] + MERGE_GAP) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    by.set(id, out);
  }
  return by;
}

/**
 * The sources' sound for a mixer (`get` is its SourceBank). `setSources` says which sources have sound;
 * `want` sets what is kept decoded; `ready`/`until` say whether a demand can be rendered.
 */
export class SoundBank {
  private readonly sources = new Map<string, WindowedSource>();
  private waiters: (() => void)[] = [];

  constructor(
    readonly feed: SoundFeed,
    readonly decoders: DecoderFactory = webDecoders,
    private readonly onProgress: () => void = () => undefined,
    /** Exports: a codec the device can't decode is an error, never silence (question 33). */
    readonly strict = false,
  ) {}

  /** The sources with sound (others are silent and never decoded); removed ones are freed. */
  setSources(ids: Iterable<string>): void {
    const keep = new Set(ids);
    for (const [id, s] of this.sources)
      if (!keep.has(id)) {
        s.drop();
        this.sources.delete(id);
      }
    for (const id of keep) if (!this.sources.has(id)) this.sources.set(id, new WindowedSource(this, id));
  }

  /** The mixer's SourceBank. */
  readonly get = (id: string): SoundSource | undefined => this.sources.get(id);

  source(id: string): WindowedSource | undefined {
    return this.sources.get(id);
  }

  /** Keeps exactly the demanded ranges decoded (and decoding); everything else is freed. */
  want(demand: readonly Demand[]): void {
    const by = mergeDemand(demand);
    for (const [id, s] of this.sources) s.want(by.get(id) ?? []);
  }

  ready(demand: readonly Demand[]): boolean {
    return demand.every((d) => this.sources.get(d.sourceId)?.ready(d.from, d.to) ?? true);
  }

  /** Resolves when `ready(demand)`; rejects with a TimeoutError after `ms` without it. */
  async until(demand: readonly Demand[], ms = Number.POSITIVE_INFINITY): Promise<void> {
    const deadline = Date.now() + ms;
    while (!this.ready(demand)) {
      const left = deadline - Date.now();
      if (left <= 0) {
        const ids = demand.filter((d) => !this.sources.get(d.sourceId)?.ready(d.from, d.to)).map((d) => d.sourceId);
        throw new Error(`TimeoutError: the sound of ${[...new Set(ids)].join(', ')} was not decoded within ${ms} ms`);
      }
      await new Promise<void>((r) => {
        const t = Number.isFinite(left) ? setTimeout(r, left) : null;
        this.waiters.push(() => {
          if (t !== null) clearTimeout(t);
          r();
        });
      });
    }
  }

  /** The preview gave up waiting: these sources play silent until they decode again (STALL_MS). */
  giveUp(demand: readonly Demand[]): void {
    for (const d of demand) {
      const s = this.sources.get(d.sourceId);
      if (s && !s.ready(d.from, d.to)) s.stalled = true;
    }
  }

  /** Sources given up on are waited for again (play, seek). */
  retry(): void {
    for (const s of this.sources.values()) s.stalled = false;
  }

  /** The first decode error among the demanded sources. */
  failureOf(demand: readonly Demand[]): string | null {
    for (const d of demand) {
      const f = this.sources.get(d.sourceId)?.failure;
      if (f) return `${d.sourceId}: ${f}`;
    }
    return null;
  }

  /** Bytes of decoded sound held (NFR-05). */
  get bytes(): number {
    let n = 0;
    for (const s of this.sources.values()) n += s.bytes;
    return n;
  }

  get cursors(): number {
    let n = 0;
    for (const s of this.sources.values()) n += s.cursors.length;
    return n;
  }

  progress(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
    this.onProgress();
  }

  dispose(): void {
    for (const s of this.sources.values()) s.drop();
    this.sources.clear();
    this.progress();
  }
}
