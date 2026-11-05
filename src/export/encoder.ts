// MOD-Export — the video encoder stage of the export worker (ADR-0010 §1 and outcome item 2):
// back-pressure on `encodeQueueSize` (cap 6, inside 4–8), the probe-recorded `latencyMode`, the stall
// watchdog (≥ 20 s, longest gap between outputs recorded) and errors as `name: message`.
// Implements: NFR-04 (throughput), NFR-05 (queue bounded), F-015.R6 (encoder failures reported).
import { createVideoEncoder, h264Codec, vp9Codec } from '../codec';
import type { ExportVideoSpec } from '../core';
import type { OutPacket } from '../container';

export const VIDEO_QUEUE_CAP = 6;
/** No encoder output for this long while frames wait: a stall (ADR-0010 outcome item 2). */
export const STALL_MS = 20_000;

export const errorText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException
    ? `${e.name}: ${e.message}`
    : typeof e === 'object' && e !== null && 'message' in e
      ? `Error: ${String((e as { message: unknown }).message)}`
      : String(e);

export class StageError extends Error {
  constructor(
    readonly kind: 'encoder' | 'webgl' | 'source' | 'sink' | 'no_space' | 'over_target' | 'audio' | 'internal',
    message: string,
  ) {
    super(message);
    this.name = 'StageError';
  }
}

/** The encoder produced nothing for STALL_MS while frames waited (the stage recovers by re-creating it). */
export class StallError extends StageError {
  constructor(gapMs: number) {
    super('encoder', `EncoderStall: no output for ${Math.round(gapMs)} ms`);
  }
}

/** Implements: ADR-0004 §5 — the export's encoder config from the spec (codec string per size and rate). */
export function encoderConfig(v: ExportVideoSpec, bitrate = v.bitrate): VideoEncoderConfig {
  const codec =
    v.codec === 'h264'
      ? h264Codec('high', Math.max(v.width, v.height), Math.min(v.width, v.height), v.rate)
      : v.codec === 'vp9'
        ? vp9Codec(v.width, v.height, v.rate)
        : 'vp8';
  const cfg: VideoEncoderConfig = {
    codec,
    width: v.width,
    height: v.height,
    framerate: v.rate,
    bitrate,
    bitrateMode: v.bitrateMode,
    latencyMode: v.latencyMode,
    hardwareAcceleration: v.acceleration,
  };
  if (v.codec === 'h264') cfg.avc = { format: 'avc' };
  return cfg;
}

/**
 * ADR-0007 outcome item 2: explicit colour tags — primaries 1, matrix 1, transfer 1 (interim), range as
 * the encoder produced it (its own metadata when it says, else limited).
 */
export function taggedConfig(meta: VideoDecoderConfig | undefined, fallback: VideoEncoderConfig): VideoDecoderConfig {
  const base: VideoDecoderConfig = meta ?? {
    codec: fallback.codec,
    codedWidth: fallback.width,
    codedHeight: fallback.height,
  };
  return {
    ...base,
    colorSpace: {
      primaries: 'bt709',
      transfer: 'bt709',
      matrix: 'bt709',
      fullRange: base.colorSpace?.fullRange ?? false,
    },
  };
}

export interface EncodedVideo {
  readonly packet: OutPacket;
  /** With the first packet: the decoder config with colour tags. */
  readonly config?: VideoDecoderConfig;
}

export class VideoEncodeStage {
  private readonly enc: VideoEncoder;
  private failure: string | null = null;
  private lastOutput: number;
  private first = true;
  longestGapMs = 0;
  waitMs = 0;
  bytes = 0;
  keyBytes = 0;
  keyCount = 0;
  deltaBytes = 0;
  deltaCount = 0;

  constructor(
    private readonly config: VideoEncoderConfig,
    private readonly onPacket: (e: EncodedVideo) => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.lastOutput = now();
    this.enc = createVideoEncoder(
      config,
      (chunk, meta) => {
        const t = this.now();
        this.longestGapMs = Math.max(this.longestGapMs, t - this.lastOutput);
        this.lastOutput = t;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const key = chunk.type === 'key';
        this.bytes += data.length;
        if (key) {
          this.keyBytes += data.length;
          this.keyCount++;
        } else {
          this.deltaBytes += data.length;
          this.deltaCount++;
        }
        const packet = { data, timestamp: chunk.timestamp / 1e6, duration: (chunk.duration ?? 0) / 1e6, key };
        if (this.first) {
          this.first = false;
          this.onPacket({ packet, config: taggedConfig(meta?.decoderConfig, this.config) });
        } else this.onPacket({ packet });
      },
      (e) => {
        this.failure ??= errorText(e);
      },
    );
  }

  private check(): void {
    if (this.failure) throw new StageError('encoder', this.failure);
  }

  /** Encodes a frame (the caller closes it afterwards); waits while the queue is over the cap. */
  async encode(frame: VideoFrame, keyFrame: boolean): Promise<void> {
    this.check();
    const t0 = this.now();
    while (this.enc.encodeQueueSize > VIDEO_QUEUE_CAP) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        this.enc.addEventListener(
          'dequeue',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      this.check();
      const gap = this.now() - this.lastOutput;
      if (gap >= STALL_MS) {
        this.longestGapMs = Math.max(this.longestGapMs, gap);
        throw new StallError(gap);
      }
    }
    this.waitMs += this.now() - t0;
    this.enc.encode(frame, { keyFrame });
  }

  /** Flushes, with the same watchdog: no output for STALL_MS while the flush is pending is a stall. */
  async flush(): Promise<void> {
    this.check();
    let stalled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const watchdog = new Promise<void>((resolve) => {
      timer = setInterval(() => {
        if (this.now() - this.lastOutput >= STALL_MS) {
          stalled = true;
          resolve();
        }
      }, 1000);
    });
    try {
      await Promise.race([this.enc.flush().catch((e: unknown) => void (this.failure ??= errorText(e))), watchdog]);
    } finally {
      clearInterval(timer);
    }
    if (stalled) throw new StallError(this.now() - this.lastOutput);
    this.check();
  }

  close(): void {
    if (this.enc.state !== 'closed') this.enc.close();
  }
}
