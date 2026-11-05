// MOD-Engine — a video source in the worker: the file read in pieces through MOD-Container (ADR-0009
// §1), WebCodecs decoders made through MOD-Codec, and decoder slots bound to it.
// Implements: F-001.R7 / NFR-05 (files stay files), F-002.R1 (decoding the picture).
import { createVideoDecoder, resolveVideoDecoderConfig } from '../codec';
import { openInput, type OpenedInput } from '../container';
import type { Rotation } from '../compositor';
import { DecoderSlot, type DecoderFactory, type PacketLike, type SlotOptions, type TrackReader } from './decoder';

export interface VideoSource {
  readonly id: string;
  /** Rotation stored in the container (MOD-Compositor applies it). */
  readonly rotation: Rotation;
  /** One frame's duration at the track's average rate, µs (feed-ahead window). */
  readonly frameUs: number;
  /** Mean seconds between keyframes (null when unknown). */
  readonly keySpacing: number | null;
  /** A decoder slot; the preview flushes decoders that hold frames back, the export reader never does. */
  newSlot(maxFrames: number, options?: SlotOptions): DecoderSlot<VideoFrame>;
  close(): void;
}

export class SourceOpenError extends Error {
  constructor(
    readonly id: string,
    cause: unknown,
  ) {
    super(`source ${id} cannot be decoded: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SourceOpenError';
  }
}

function readerOf(input: OpenedInput): TrackReader {
  return {
    packetAt: (t) => input.packetAt('video', t),
    keyPacketAt: (t) => input.keyPacketAt('video', t),
    packets: (from) => input.packets('video', from)[Symbol.asyncIterator](),
  };
}

const chunkOf = (p: PacketLike): EncodedVideoChunk =>
  new EncodedVideoChunk({
    type: p.key ? 'key' : 'delta',
    timestamp: Math.round(p.timestamp * 1_000_000),
    duration: Math.round(p.duration * 1_000_000),
    data: p.data,
  });

/** Opens a video file for preview decoding; rejects with SourceOpenError (→ `sourceError(id)`). */
export async function openVideoSource(id: string, file: Blob): Promise<VideoSource> {
  let input: OpenedInput | null = null;
  try {
    input = await openInput(file);
    const track = input.video;
    if (!track) throw new Error('no video track');
    const config = await resolveVideoDecoderConfig(track.decoderConfig);
    if (!config) throw new Error(`decoder config not supported: ${track.codec}`);
    const keySpacing = await input.keyframeSpacing().catch(() => null);
    const reader = readerOf(input);
    const opened = input;
    const soft: VideoDecoderConfig = { ...config, hardwareAcceleration: 'prefer-software' };
    // The retry after a decoder error prefers software decoding (MOD-Codec hardware/software retry).
    const factory: DecoderFactory<VideoFrame> = (output, error, software) => {
      let used = software ? soft : config;
      let d: VideoDecoder;
      try {
        d = createVideoDecoder(used, output, error);
      } catch {
        used = config;
        d = createVideoDecoder(used, output, error);
      }
      return {
        get state() {
          return d.state;
        },
        get decodeQueueSize() {
          return d.decodeQueueSize;
        },
        decode: (p) => d.decode(chunkOf(p)),
        flush: () => d.flush(),
        restart: () => {
          d.reset();
          d.configure(used);
        },
        close: () => d.close(),
      };
    };
    const frameUs = 1_000_000 / (track.frameRate > 0 ? track.frameRate : 30);
    return {
      id,
      rotation: track.rotation,
      frameUs,
      keySpacing,
      newSlot: (max, options = { idleFlush: true }) =>
        new DecoderSlot<VideoFrame>(
          reader,
          factory,
          frameUs,
          (f) => f.clone(),
          max,
          () => performance.now(),
          options,
        ),
      close: () => opened.close(),
    };
  } catch (e) {
    input?.close();
    throw new SourceOpenError(id, e);
  }
}
