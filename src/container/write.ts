// MOD-Container — the writer (DEP-04 mediabunny, D-042: imported by the export worker only). Writes
// encoded packets into MP4, WebM, M4A or Ogg on a streaming target: MP4/M4A with the index at the end
// (`fastStart: false`), so every byte goes to the sink as it is made and nothing is held for a second
// copy (ADR-0010 §2.1). No metadata beyond what each format requires: creation times zeroed, no tags
// (RULE-15 "Contents", ADR-0010 §9). Audio packet times arrive already shifted by the encoder delay,
// so the writer's edit list removes the priming (ADR-0010 outcome item 3).
// Implements: F-015.R4 (clean files), F-016.R2, RULE-15 Contents.
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type StreamTargetChunk,
} from 'mediabunny';

/** A streaming target the writer fills: implemented by MOD-Scratch (file) and MOD-Export (memory). */
export interface Sink {
  write(chunk: Uint8Array, position: number): void | Promise<void>;
  close(): void | Promise<void>;
}

export type OutputFormat = 'mp4' | 'webm' | 'm4a' | 'ogg';

export interface TrackSpecs {
  readonly video?: { readonly codec: 'avc' | 'vp9' | 'vp8'; readonly frameRate: number };
  readonly audio?: { readonly codec: 'aac' | 'opus' };
}

/** One encoded packet to write; times in seconds. */
export interface OutPacket {
  readonly data: Uint8Array;
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
}

/** MOD-Container public surface: `createOutput(format, sink, trackSpecs)`. */
export interface MediaWriter {
  /** In decode order; the first call carries the decoder config (with explicit colour tags). */
  addVideo(packet: OutPacket, config?: VideoDecoderConfig): Promise<void>;
  /** The first call carries the (normalised) decoder config. */
  addAudio(packet: OutPacket, config?: AudioDecoderConfig): Promise<void>;
  /** Writes the index (the caller closes the sink). */
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

const packetOf = (p: OutPacket): EncodedPacket =>
  new EncodedPacket(p.data, p.key ? 'key' : 'delta', p.timestamp, p.duration);

export async function createOutput(format: OutputFormat, sink: Sink, tracks: TrackSpecs): Promise<MediaWriter> {
  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => sink.write(chunk.data, chunk.position),
  });
  const output = new Output({
    format:
      format === 'webm'
        ? new WebMOutputFormat()
        : format === 'ogg'
          ? new OggOutputFormat()
          : new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(writable),
  });
  output.setMetadataTags({ creationTime: null });
  const video = tracks.video ? new EncodedVideoPacketSource(tracks.video.codec) : null;
  const audio = tracks.audio ? new EncodedAudioPacketSource(tracks.audio.codec) : null;
  if (video && tracks.video) output.addVideoTrack(video, { frameRate: tracks.video.frameRate });
  if (audio) output.addAudioTrack(audio);
  await output.start();
  return {
    addVideo: async (p, config) => {
      if (!video) throw new Error('no video track');
      await video.add(packetOf(p), config ? { decoderConfig: config } : undefined);
    },
    addAudio: async (p, config) => {
      if (!audio) throw new Error('no audio track');
      await audio.add(packetOf(p), config ? { decoderConfig: config } : undefined);
    },
    finalize: () => output.finalize(),
    cancel: () => output.cancel(),
  };
}
