// MOD-Container — read and write media files in pieces; the only module that imports the container
// library (DEP-04 mediabunny 1.65.0, pinned and unmodified, ADR-0005 / D-042; lint-enforced). Runs in
// workers only (specs/40-technical/modules/MOD-Container.md). This file is the read side (promoted
// from SP-license adapter A and SP-mem-hdr's decoder source); the writer is in ./write.ts and only the
// export worker imports it (tree-shaken out of the engine and analysis bundles, D-042).
// Implements: F-001.R2/R7 (reading), RULE-01 (container part), NFR-05.
import {
  ADTS,
  BlobSource,
  EncodedPacketSink,
  FLAC,
  Input,
  MATROSKA,
  MP3,
  MP4,
  OGG,
  QTFF,
  WAVE,
  WEBM,
  type EncodedPacket,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';

/**
 * Why a file can't be read (ADR-0005 outcome: mediabunny does not throw on a missing `moov`, so "no
 * tracks" and "0 packets" are turned into this typed error here):
 * - `unsupported`: not a container this tool reads (RULE-01 types);
 * - `no_media`: readable, but no track with packets;
 * - `damaged`: the reader failed on the file's tables or data;
 * - `protected`: the samples are encrypted.
 */
export type ContainerErrorCode = 'unsupported' | 'no_media' | 'damaged' | 'protected';

export class ContainerError extends Error {
  constructor(
    readonly code: ContainerErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ContainerError';
  }
}

/** The containers of RULE-01 (no HLS, MPEG-TS or others). */
const FORMATS = [MP4, QTFF, WEBM, MATROSKA, OGG, MP3, WAVE, ADTS, FLAC];

/** Presentation times come from the index: the packet covering t is `getPacket(t + 2 µs)` (ADR-0009). */
export const INDEX_EPSILON_S = 2e-6;

export type Rotation = 0 | 90 | 180 | 270;

export interface VideoTrackInfo {
  readonly id: number;
  /** WebCodecs codec string; mediabunny may say `hev1.…` for an `hvc1` entry (both decode). */
  readonly codec: string;
  readonly decoderConfig: VideoDecoderConfig;
  readonly codedWidth: number;
  readonly codedHeight: number;
  /** Picture size after the container's rotation and pixel aspect ratio. */
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly rotation: Rotation;
  readonly colorSpace: VideoColorSpaceInit;
  readonly hdr: boolean;
  /** Average frames per second over the first packets (never from metadata). */
  readonly frameRate: number;
  /** Seconds; negative when an edit list trims the start (MOD-Engine drops frames before 0). */
  readonly firstTimestamp: number;
}

export interface AudioTrackInfo {
  readonly id: number;
  readonly codec: string;
  readonly decoderConfig: AudioDecoderConfig;
  readonly sampleRate: number;
  readonly channels: number;
  readonly firstTimestamp: number;
}

/** One encoded packet, times in seconds on the container timeline (edit lists applied). */
export interface Packet {
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
  readonly data: Uint8Array;
}

export type TrackKind = 'video' | 'audio';

/** What `openInput` reports about a file, and piece-by-piece access to its packets. */
export interface OpenedInput {
  /** The container's name as the reader reports it (e.g. "MP4", "WebM"). */
  readonly format: string;
  /** Seconds: the largest end time of any track. */
  readonly duration: number;
  readonly video: VideoTrackInfo | null;
  readonly audio: AudioTrackInfo | null;
  /** Packets of a track in decode order from the key packet at or before `from` seconds. */
  packets(kind: TrackKind, from?: number): AsyncIterable<Packet>;
  /** The packet presented at time `t` (index lookup, `t + 2 µs`), or null before the first. */
  packetAt(kind: TrackKind, t: number): Promise<Packet | null>;
  /** The key packet at or before time `t` (falls back to the first packet). */
  keyPacketAt(kind: TrackKind, t: number): Promise<Packet | null>;
  /** Mean seconds between the key packets seen in the first `limit` packets (MOD-Media probe). */
  keyframeSpacing(limit?: number): Promise<number | null>;
  close(): void;
}

const toPacket = (p: EncodedPacket): Packet => ({
  timestamp: p.timestamp,
  duration: p.duration,
  key: p.type === 'key',
  data: p.data,
});

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'InputDisposedError';

/** Turns reader failures into typed errors; keeps our own typed errors and disposal as they are. */
function classify(e: unknown): Error {
  if (e instanceof ContainerError || isAbort(e)) return e as Error;
  const name = e instanceof Error ? e.name : '';
  if (name === 'UnsupportedInputFormatError') return new ContainerError('unsupported', String(e));
  return new ContainerError('damaged', e instanceof Error ? e.message : String(e));
}

async function videoInfo(t: InputVideoTrack): Promise<VideoTrackInfo | null> {
  const decoderConfig = await t.getDecoderConfig();
  if (!decoderConfig) return null;
  const stats = await t.computePacketStats(120);
  return {
    id: t.id,
    codec: decoderConfig.codec,
    decoderConfig,
    codedWidth: await t.getCodedWidth(),
    codedHeight: await t.getCodedHeight(),
    displayWidth: await t.getDisplayWidth(),
    displayHeight: await t.getDisplayHeight(),
    rotation: (await t.getRotation()) as Rotation,
    colorSpace: await t.getColorSpace(),
    hdr: await t.hasHighDynamicRange(),
    frameRate: stats.averagePacketRate,
    firstTimestamp: await t.getFirstTimestamp(),
  };
}

async function audioInfo(t: InputAudioTrack): Promise<AudioTrackInfo | null> {
  const decoderConfig = await t.getDecoderConfig();
  if (!decoderConfig) return null;
  return {
    id: t.id,
    codec: decoderConfig.codec,
    decoderConfig,
    sampleRate: await t.getSampleRate(),
    channels: await t.getNumberOfChannels(),
    firstTimestamp: await t.getFirstTimestamp(),
  };
}

/** A track with no packets is no track (ADR-0005 outcome). */
async function hasPackets(sink: EncodedPacketSink): Promise<boolean> {
  return (await sink.getFirstPacket({ metadataOnly: true })) !== null;
}

/**
 * Opens a file for reading in pieces: the reader only ever takes `Blob.slice()` ranges, never the
 * whole file (F-001.R7, NFR-05). Throws ContainerError for unreadable, empty, damaged or protected
 * files. Implements: F-001.R2 (container part of RULE-01), F-001.R7.
 */
export async function openInput(file: Blob): Promise<OpenedInput> {
  let encrypted = false;
  const input = new Input({
    source: new BlobSource(file),
    formats: FORMATS,
    formatOptions: {
      isobmff: {
        // Implements: RULE-01 protected files — any key request means the samples are encrypted.
        resolveKeyId: () => {
          encrypted = true;
          throw new ContainerError('protected');
        },
      },
    },
  });
  const fail = (e: unknown): never => {
    input.dispose();
    throw encrypted ? new ContainerError('protected') : classify(e);
  };
  try {
    if (!(await input.canRead())) throw new ContainerError('unsupported');
    const format = (await input.getFormat()).name;
    const vTrack = await input.getPrimaryVideoTrack();
    const aTrack = await input.getPrimaryAudioTrack();
    const vSink = vTrack ? new EncodedPacketSink(vTrack) : null;
    const aSink = aTrack ? new EncodedPacketSink(aTrack) : null;
    const video = vTrack && vSink && (await hasPackets(vSink)) ? await videoInfo(vTrack) : null;
    const audio = aTrack && aSink && (await hasPackets(aSink)) ? await audioInfo(aTrack) : null;
    if (!video && !audio) throw new ContainerError('no_media', 'no track with packets');
    // A picture track whose tables give no packets is damaged, not "audio only"; an empty sound
    // track only leaves the video silent (RULE-01 no_sound).
    if (vTrack && !video) throw new ContainerError('damaged', 'video track without packets');
    const tracks = [video ? vTrack : null, audio ? aTrack : null].filter((t) => t !== null);
    const duration = await input.computeDuration(tracks);
    const sinkOf = (kind: TrackKind): EncodedPacketSink | null =>
      kind === 'video' ? (video ? vSink : null) : audio ? aSink : null;
    const guard = async <T>(f: () => Promise<T>): Promise<T> => {
      try {
        return await f();
      } catch (e) {
        throw encrypted ? new ContainerError('protected') : classify(e);
      }
    };
    return {
      format,
      duration,
      video,
      audio,
      async *packets(kind, from = -Infinity) {
        const sink = sinkOf(kind);
        if (!sink) return;
        const start =
          from === -Infinity
            ? undefined
            : ((await guard(() => sink.getKeyPacket(from, { verifyKeyPackets: true }))) ?? undefined);
        const iter = sink.packets(start)[Symbol.asyncIterator]();
        for (;;) {
          const next = await guard(() => iter.next());
          if (next.done) return;
          yield toPacket(next.value);
        }
      },
      packetAt: (kind, t) =>
        guard(async () => {
          const p = await sinkOf(kind)?.getPacket(t + INDEX_EPSILON_S);
          return p ? toPacket(p) : null;
        }),
      keyPacketAt: (kind, t) =>
        guard(async () => {
          const sink = sinkOf(kind);
          if (!sink) return null;
          const p = (await sink.getKeyPacket(t, { verifyKeyPackets: true })) ?? (await sink.getFirstPacket());
          return p ? toPacket(p) : null;
        }),
      keyframeSpacing: (limit = 300) =>
        guard(async () => {
          if (!vSink || !video) return null;
          const keys: number[] = [];
          let n = 0;
          for await (const p of vSink.packets(undefined, undefined, { metadataOnly: true })) {
            if (p.type === 'key') keys.push(p.timestamp);
            if (++n >= limit) break;
          }
          if (keys.length < 2) return null;
          return ((keys.at(-1) ?? 0) - (keys[0] ?? 0)) / (keys.length - 1);
        }),
      close: () => input.dispose(),
    };
  } catch (e) {
    return fail(e);
  }
}

export * from './write';
