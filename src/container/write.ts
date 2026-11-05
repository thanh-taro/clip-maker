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

const LIBRARY = [0x4d, 0x65, 0x64, 0x69, 0x61, 0x62, 0x75, 0x6e, 0x6e, 0x79]; // "Mediabunny"
/** The longest library string the writer puts in a fixed field ("MediabunnySoundHandler", "Mediabunny v…"). */
const MAX_NAME = 40;
const printable = (b: number | undefined): boolean => b !== undefined && b >= 0x20 && b <= 0x7e;

/** Ogg's CRC-32 (polynomial 0x04C11DB7, not reflected, initial 0). */
const OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
export function oggCrc(page: Uint8Array): number {
  let crc = 0;
  for (const b of page) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ b) & 0xff]!) >>> 0;
  return crc;
}

/** Recomputes the CRC of the Ogg page holding `at`, when the whole page is in `buf`. */
function fixOggPage(buf: Uint8Array, at: number): void {
  for (let p = Math.min(at, buf.length - 4); p >= 0; p--) {
    if (buf[p] !== 0x4f || buf[p + 1] !== 0x67 || buf[p + 2] !== 0x67 || buf[p + 3] !== 0x53) continue;
    const segs = buf[p + 26];
    if (segs === undefined || p + 27 + segs > buf.length) break;
    let len = 27 + segs;
    for (let i = 0; i < segs; i++) len += buf[p + 27 + i]!;
    if (p + len > buf.length || at >= p + len) break;
    const page = buf.subarray(p, p + len);
    page.fill(0, 22, 26);
    const crc = oggCrc(page);
    new DataView(page.buffer, page.byteOffset).setUint32(22, crc, true);
    return;
  }
  throw new Error('NotSupportedError: an Ogg header page spans two writes');
}

/**
 * Implements: RULE-15 Contents, F-015.R4 — no metadata beyond what the format requires. The library
 * (DEP-04, used unmodified, D-042) writes its own name into fixed fields: the MP4 `hdlr` names and the
 * `avc1` compressor name, WebM's mandatory MuxingApp/WritingApp, and the Ogg Opus vendor string. This
 * sink in front of the real one blanks every such string in place (zero bytes, same length, so offsets
 * and sizes stay valid; for the compressor name its Pascal length byte too), across write boundaries,
 * and re-computes the Ogg page CRC it touches.
 */
export class NeutralSink implements Sink {
  private tail = new Uint8Array(0);
  private tailAt = 0;
  /** A name ran to the end of the last write: blank its continuation. */
  private carry = 0;

  constructor(
    private readonly out: Sink,
    private readonly ogg = false,
  ) {}

  async write(chunk: Uint8Array, position: number): Promise<void> {
    const contiguous = this.tail.length > 0 && this.tailAt + this.tail.length === position;
    const head = contiguous ? this.tail : new Uint8Array(0);
    const buf = new Uint8Array(head.length + chunk.length);
    buf.set(head);
    buf.set(chunk, head.length);
    let touchedHead = false;
    let start = 0;
    if (contiguous && this.carry > 0) {
      start = head.length;
      while (this.carry > 0 && start < buf.length && printable(buf[start])) {
        buf[start++] = 0;
        this.carry--;
      }
    }
    this.carry = 0;
    for (let i = start; i + LIBRARY.length <= buf.length; i++) {
      if (!LIBRARY.every((b, k) => buf[i + k] === b)) continue;
      let end = i;
      while (end < buf.length && end - i < MAX_NAME && printable(buf[end])) end++;
      this.carry = end === buf.length ? MAX_NAME - (end - i) : 0;
      if (!this.ogg && i > 0 && buf[i - 1] === end - i) {
        buf[i - 1] = 0; // the compressor name's Pascal length
        if (i - 1 < head.length) touchedHead = true;
      }
      buf.fill(0, i, end);
      if (i < head.length) touchedHead = true;
      if (this.ogg) fixOggPage(buf, i);
      i = end - 1;
    }
    if (touchedHead) await this.out.write(buf.slice(0, head.length), this.tailAt);
    const body = buf.subarray(head.length);
    await this.out.write(body, position);
    const keep = Math.min(body.length, MAX_NAME + 4);
    this.tail = body.slice(body.length - keep);
    this.tailAt = position + body.length - keep;
  }

  close(): void | Promise<void> {
    return this.out.close();
  }
}

const packetOf = (p: OutPacket): EncodedPacket =>
  new EncodedPacket(p.data, p.key ? 'key' : 'delta', p.timestamp, p.duration);

export async function createOutput(format: OutputFormat, sink: Sink, tracks: TrackSpecs): Promise<MediaWriter> {
  const clean = new NeutralSink(sink, format === 'ogg');
  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => clean.write(chunk.data, chunk.position),
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
