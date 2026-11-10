// Test support: a synthetic encoded sound track behind MOD-Audio's sound feed, and a fake decoder.
// A "packet" carries the index of its first sample; the fake decoder outputs the track's samples for it
// (asynchronously, like AudioDecoder), so windowing, seeks, priming and resampling run without codecs.
import type { DecoderFactory, FeedBatch, FeedStream, PcmDecoder, SoundFeed } from '../../src/audio';
import type { FeedPacket } from '../../src/core';

export interface FakeTrack {
  /** Native sample rate. */
  readonly rate: number;
  /** Samples per packet. */
  readonly frames: number;
  /** Encoder priming before time 0, in native samples (removed by an edit list: negative times). */
  readonly priming: number;
  /** Native samples after the priming. */
  readonly length: number;
  /** Channels decoded. */
  readonly channels: number;
  /** The decoded sample of channel c at native index n (n < 0: priming). */
  sample(n: number, c: number): number;
}

export interface FeedLog {
  /** Every stream opened: [sourceId, from seconds]. */
  readonly opens: [string, number][];
  /** Streams open now. */
  open: number;
  /** Packets handed out. */
  packets: number;
}

/** A sound feed over named fake tracks (`null` = a file without a sound track). */
export function fakeFeed(tracks: Record<string, FakeTrack | null>, batchSeconds = 0.5): SoundFeed & { log: FeedLog } {
  const log: FeedLog = { opens: [], open: 0, packets: 0 };
  return {
    log,
    open(sourceId: string, from: number): FeedStream {
      log.opens.push([sourceId, from]);
      log.open++;
      const t = tracks[sourceId];
      let closed = false;
      let next = -1;
      const total = t ? Math.ceil((t.length + t.priming) / t.frames) : 0;
      return {
        async next(): Promise<FeedBatch> {
          await Promise.resolve();
          if (closed) throw new Error('AbortError: closed');
          if (!t) return { config: null, packets: [], done: true };
          const head = next < 0;
          if (head) next = Math.max(0, Math.min(total - 1, Math.floor((from * t.rate + t.priming) / t.frames)));
          const packets: FeedPacket[] = [];
          const per = Math.max(1, Math.round((batchSeconds * t.rate) / t.frames));
          while (packets.length < per && next < total) {
            const n0 = next * t.frames - t.priming;
            const data = new Uint8Array(new Int32Array([n0]).buffer);
            packets.push({ t: n0 / t.rate, d: t.frames / t.rate, data });
            next++;
          }
          log.packets += packets.length;
          const done = next >= total;
          const base = { packets, done };
          return head
            ? {
                ...base,
                config: { codec: 'fake', sampleRate: t.rate, numberOfChannels: t.channels },
                first: next - packets.length === 0,
              }
            : base;
        },
        close() {
          if (!closed) log.open--;
          closed = true;
        },
      };
    },
  };
}

/** The fake decoder: outputs each packet's samples on a later microtask; `fail` after N packets. */
export function fakeDecoders(
  tracks: Record<string, FakeTrack | null>,
  opts: { failAfter?: number; unsupported?: boolean } = {},
): DecoderFactory & { live: number } {
  const factory = (async (config, output, error) => {
    if (opts.unsupported) return null;
    const t = Object.values(tracks).find(
      (x) => x && x.rate === config.sampleRate && x.channels === config.numberOfChannels,
    )!;
    let pending = Promise.resolve();
    let queue = 0;
    let decoded = 0;
    factory.live++;
    const dec: PcmDecoder = {
      decode(p: FeedPacket) {
        queue++;
        const n0 = new Int32Array(p.data.slice().buffer)[0]!;
        pending = pending.then(() => {
          queue--;
          if (opts.failAfter !== undefined && ++decoded > opts.failAfter) return error('EncodingError: bad packet');
          const n = Math.min(t.frames, t.length - n0);
          if (n <= 0) return;
          const planes = Array.from({ length: t.channels }, (_, c) =>
            Float32Array.from({ length: n }, (_, i) => t.sample(n0 + i, c)),
          );
          output(planes, t.rate, Math.round((n0 / t.rate) * 1e6));
        });
      },
      flush: () => pending,
      close: () => void factory.live--,
      get queue() {
        return queue;
      },
      drained: () => pending,
    };
    return dec;
  }) as DecoderFactory & { live: number };
  factory.live = 0;
  return factory;
}

/** Lets every pending decode step run. */
export async function settle(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}
