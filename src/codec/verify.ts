// MOD-Codec — "the device can decode" for one source: `isConfigSupported` with the container's real
// config, then the first packets decoded for real (ADR-0004 §2 and outcome item 5; platform-mapping
// "The device can decode — false positives": WebKit FLAC passes the probe and then fails).
import { supports } from './probe';
import { withNormalisedDescription } from './util';

/** One encoded packet as MOD-Container gives it (times in seconds). */
export interface EncodedInput {
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
  readonly data: Uint8Array;
}

export interface DecodeCheckOptions {
  /** Most packets fed before giving up (WebKit holds frames until ≥ 12 are fed, ADR-0009 item 3). */
  readonly maxPackets?: number;
  /** Time allowed for the flush that forces held frames out. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | undefined;
}

/** Why a source's track does not decode on this device (both give COPY-reason.codec). */
export type DecodeFailure = 'unsupported-config' | 'decode-failed';

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

async function take<T>(packets: AsyncIterable<T>, n: number, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  for await (const p of packets) {
    signal?.throwIfAborted();
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Implements: RULE-01 decodability, F-023.R2 — the video track counts as decodable only once a
 * frame comes out of a real decoder fed with its first packets. Returns null on success.
 */
export async function checkVideoDecodes(
  config: VideoDecoderConfig,
  packets: AsyncIterable<EncodedInput>,
  { maxPackets = 24, timeoutMs = 5000, signal }: DecodeCheckOptions = {},
): Promise<DecodeFailure | null> {
  if (!(await supports(globalThis.VideoDecoder, config))) return 'unsupported-config';
  const first = await take(packets, maxPackets, signal);
  let frames = 0;
  let error = false;
  const dec = new VideoDecoder({
    output: (f) => {
      frames++;
      f.close();
    },
    error: () => {
      error = true;
    },
  });
  try {
    dec.configure(config);
    for (const p of first) {
      if (error || frames > 0) break;
      dec.decode(
        new EncodedVideoChunk({
          type: p.key ? 'key' : 'delta',
          timestamp: Math.round(p.timestamp * 1e6),
          duration: Math.round(p.duration * 1e6),
          data: p.data,
        }),
      );
    }
    if (!error && frames === 0) {
      await withTimeout(
        dec.flush().catch(() => {
          error = true;
        }),
        timeoutMs,
      );
    }
  } catch {
    error = true;
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
  signal?.throwIfAborted();
  return frames > 0 && !error ? null : 'decode-failed';
}

/**
 * Implements: RULE-01 decodability, F-023.R2 — the sound track counts as decodable only once its
 * first window decodes to samples (catches WebKit's FLAC false positive). Returns null on success.
 */
export async function checkAudioDecodes(
  config: AudioDecoderConfig,
  packets: AsyncIterable<EncodedInput>,
  { maxPackets = 16, timeoutMs = 5000, signal }: DecodeCheckOptions = {},
): Promise<DecodeFailure | null> {
  const cfg = withNormalisedDescription(config);
  if (!(await supports(globalThis.AudioDecoder, cfg))) return 'unsupported-config';
  const first = await take(packets, maxPackets, signal);
  let samples = 0;
  let error = false;
  const dec = new AudioDecoder({
    output: (a) => {
      samples += a.numberOfFrames;
      a.close();
    },
    error: () => {
      error = true;
    },
  });
  try {
    dec.configure(cfg);
    for (const p of first) {
      if (error) break;
      dec.decode(
        new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(p.timestamp * 1e6),
          duration: Math.round(p.duration * 1e6),
          data: p.data,
        }),
      );
    }
    if (!error) {
      const r = await withTimeout(
        dec.flush().catch(() => {
          error = true;
        }),
        timeoutMs,
      );
      if (r === 'timeout') error = true;
    }
  } catch {
    error = true;
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
  signal?.throwIfAborted();
  return samples > 0 && !error ? null : 'decode-failed';
}
