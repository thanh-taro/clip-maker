// MOD-Export — the export-audio worker's work (ADR-0003 outcome, ADR-0008 outcome item 2, ADR-0010
// outcome item 1): mix the whole project with MOD-Audio's mixer and limiter in blocks, encode, decode the
// result and measure its true peak, and repeat with a trimmed gain per MOD-Audio's `verifyAndTrim`
// (≤ 3 passes, the fixed −3 dB fallback). The mix is re-rendered for each pass (deterministic, so a
// 10-minute mix is never held whole); only the last pass's encoded packets are kept (≈ 14 MB / 10 min).
// Packet times are shifted by the trial's encoder delay so the writer's edit list removes the priming.
// The WAV writer streams 16-bit blocks with a fixed-seed triangular dither (ADR-0010 §11).
// Implements: RULE-12 Mix (decoded export ≤ −1.0 dBTP), F-011.R5, F-016.R2, RULE-16 WAV, NFR-08.
import {
  Mixer,
  TruePeakMeter,
  TRIM_LIMIT_DB,
  verifyAndTrim,
  linearOf,
  wavHeader,
  type SourceBank,
  type TrimResult,
} from '../audio';
import { createAudioDecoder, createAudioEncoder, withNormalisedDescription } from '../codec';
import type { AudioPacketData } from '../core';
import type { Voice } from '../plan';
import { SAMPLE_RATE } from '../plan';

/** Mix block: 100 ms. */
export const MIX_BLOCK = 4800;
/** Encoder / decoder queue cap before waiting (memory flat). */
export const AUDIO_QUEUE_CAP = 16;

export interface EncodedOut {
  readonly data: Uint8Array;
  /** µs, as the encoder stamped it. */
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
}

/** The WebCodecs parts used (fakes in unit tests). */
export interface AudioCodecs {
  encode(
    config: AudioEncoderConfig,
    blocks: AsyncIterable<[Float32Array, Float32Array]>,
  ): Promise<{ packets: EncodedOut[]; config: AudioDecoderConfig }>;
  /** Decodes packets and feeds each decoded planar block to `onBlock`. */
  decode(
    config: AudioDecoderConfig,
    packets: readonly EncodedOut[],
    onBlock: (planes: Float32Array[]) => void,
  ): Promise<void>;
}

export interface MixJob {
  readonly voices: readonly Voice[];
  readonly bank: SourceBank;
  readonly endSample: number;
}

/** The project's limited mix in 100 ms blocks, scaled by `gain` (linear). Same samples as the preview. */
export async function* mixBlocks(
  job: MixJob,
  gain = 1,
  onProgress?: (done: number) => void,
): AsyncGenerator<[Float32Array, Float32Array]> {
  const mixer = new Mixer(job.voices, job.bank, job.endSample);
  mixer.seek(0, 0);
  for (let at = 0; at < job.endSample;) {
    const n = Math.min(MIX_BLOCK, job.endSample - at);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    mixer.process(L, R);
    if (gain !== 1)
      for (let i = 0; i < n; i++) {
        L[i] = L[i]! * gain;
        R[i] = R[i]! * gain;
      }
    at += n;
    onProgress?.(at);
    yield [L, R];
  }
}

export interface LossyResult {
  readonly packets: AudioPacketData[];
  readonly decoderConfig: AudioDecoderConfig;
  readonly trim: TrimResult;
}

/** A sound encoder or decoder error (ADR-0010 outcome item 10 rule (c): after a hide, an interruption). */
export class AudioCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioCodecError';
  }
}

/**
 * Implements: ADR-0008 outcome item 2 — encode, decode, measure, trim (≤ 3 passes; the −3 dB fallback
 * is encoded but not measured). With a known project gain (shared by every export of the mix) one
 * encode at that gain is measured; if it is above −1.0 dBTP the trim runs again from that gain.
 * `onAlive` is called while mixing and while decoding (liveness for the interruption rules).
 */
export async function lossyAudio(
  job: MixJob,
  config: AudioEncoderConfig,
  encoderDelay: number,
  codecs: AudioCodecs,
  knownGainDb: number | null,
  onProgress?: (done: number, total: number) => void,
  onAlive?: () => void,
): Promise<LossyResult> {
  let last: { packets: EncodedOut[]; config: AudioDecoderConfig } | null = null;
  const pass = async (gainDb: number, measure = true): Promise<number> => {
    last = await codecs.encode(
      config,
      mixBlocks(job, linearOf(gainDb), (d) => {
        onProgress?.(d, job.endSample);
        onAlive?.();
      }),
    );
    if (!measure) return Number.NaN;
    const meter = new TruePeakMeter();
    await codecs.decode(last.config, last.packets, (planes) => {
      meter.push(planes);
      onAlive?.();
    });
    return meter.finish().dB;
  };
  let trim: TrimResult;
  if (knownGainDb !== null) {
    const peakDb = await pass(knownGainDb);
    if (peakDb <= TRIM_LIMIT_DB) trim = { gainDb: knownGainDb, peakDb, passes: 1, fallback: false };
    else {
      const again = await verifyAndTrim(pass, knownGainDb);
      trim = { ...again, passes: again.passes + 1 };
    }
  } else trim = await verifyAndTrim(pass);
  const done = last as { packets: EncodedOut[]; config: AudioDecoderConfig } | null;
  if (!done) throw new Error('audio: no encode pass ran');
  const shift = encoderDelay / SAMPLE_RATE;
  return {
    packets: done.packets.map((p) => ({
      data: p.data,
      timestamp: p.timestamp / 1e6 - shift,
      duration: p.duration / 1e6,
      key: p.key,
    })),
    decoderConfig: done.config,
    trim,
  };
}

/** Fixed-seed triangular (TPDF) dither of ±1 LSB, so repeated WAV exports are identical (ADR-0010 §11). */
export class Dither {
  private s: number;
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0;
  }
  private next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  /** A float sample as a dithered signed 16-bit value. */
  sample(x: number): number {
    const v = Math.round(x * 32767 + this.next() - this.next());
    return Math.max(-32768, Math.min(32767, v));
  }
}

/**
 * Implements: RULE-16 WAV (16-bit, 48 kHz, stereo), ADR-0010 §11 — the header (44 bytes, for `frames`)
 * and the interleaved little-endian bytes of each block, streamed to `out`.
 */
export async function wavAudio(
  job: MixJob,
  out: (bytes: Uint8Array) => void,
  onProgress?: (done: number, total: number) => void,
  gainDb = 0,
): Promise<{ header: Uint8Array; frames: number }> {
  const dither = new Dither();
  for await (const [L, R] of mixBlocks(job, linearOf(gainDb), (d) => onProgress?.(d, job.endSample))) {
    const b = new Uint8Array(L.length * 4);
    const v = new DataView(b.buffer);
    for (let i = 0; i < L.length; i++) {
      v.setInt16(i * 4, dither.sample(L[i]!), true);
      v.setInt16(i * 4 + 2, dither.sample(R[i]!), true);
    }
    out(b);
  }
  return { header: wavHeader(job.endSample), frames: job.endSample };
}

/** A codec queue that does not move for this long is a stall (as the video encoder, ADR-0010 outcome item 2). */
export const AUDIO_STALL_MS = 20_000;

/**
 * Waits for `dequeue` while `queued()` is over the cap, checking every second; throws an
 * AudioCodecError when the queue has not moved for AUDIO_STALL_MS (a dead or hung codec).
 */
export async function drain(target: EventTarget, queued: () => number, failed: () => string | null): Promise<void> {
  let last = Date.now();
  let size = queued();
  while (queued() > AUDIO_QUEUE_CAP && !failed()) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      target.addEventListener('dequeue', () => (clearTimeout(timer), resolve()), { once: true });
    });
    if (queued() !== size) {
      size = queued();
      last = Date.now();
    } else if (Date.now() - last >= AUDIO_STALL_MS)
      throw new AudioCodecError(`AudioStall: the queue has not moved for ${AUDIO_STALL_MS} ms`);
  }
}

/** flush() with the same stall limit. */
async function flushWithin(p: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AudioCodecError('AudioStall: flush did not finish')), AUDIO_STALL_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const errorText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);

/** The browser's AudioEncoder / AudioDecoder (export-audio worker). */
export const webCodecsAudio: AudioCodecs = {
  async encode(config, blocks) {
    const packets: EncodedOut[] = [];
    let decoderConfig: AudioDecoderConfig | null = null;
    let failure: string | null = null;
    const enc = createAudioEncoder(
      config,
      (chunk, meta) => {
        if (meta?.decoderConfig && !decoderConfig) decoderConfig = meta.decoderConfig;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        packets.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === 'key' });
      },
      (e) => {
        failure ??= errorText(e);
      },
    );
    let at = 0;
    for await (const [L, R] of blocks) {
      if (failure) break;
      const planar = new Float32Array(L.length * 2);
      planar.set(L);
      planar.set(R, L.length);
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: L.length,
        numberOfChannels: 2,
        timestamp: Math.round((at * 1e6) / SAMPLE_RATE),
        data: planar,
      });
      enc.encode(data);
      data.close();
      at += L.length;
      await drain(
        enc,
        () => enc.encodeQueueSize,
        () => failure,
      );
    }
    if (!failure) await flushWithin(enc.flush().catch((e: unknown) => void (failure ??= errorText(e))));
    if (enc.state !== 'closed') enc.close();
    if (failure) throw new AudioCodecError(failure);
    if (!decoderConfig) throw new AudioCodecError('EncodingError: no decoder config from the audio encoder');
    // WebKit's AAC description is a whole ES_Descriptor (ADR-0004 outcome item 4).
    return { packets, config: withNormalisedDescription(decoderConfig as AudioDecoderConfig) };
  },

  async decode(config, packets, onBlock) {
    let failure: string | null = null;
    const dec = createAudioDecoder(
      config,
      (a) => {
        const planes = [0, 1].map((c) => {
          const p = new Float32Array(a.numberOfFrames);
          a.copyTo(p, { planeIndex: Math.min(c, a.numberOfChannels - 1), format: 'f32-planar' });
          return p;
        });
        a.close();
        onBlock(planes);
      },
      (e) => {
        failure ??= errorText(e);
      },
    );
    for (const p of packets) {
      if (failure) break;
      dec.decode(new EncodedAudioChunk({ type: p.key ? 'key' : 'delta', timestamp: p.timestamp, data: p.data }));
      await drain(
        dec,
        () => dec.decodeQueueSize,
        () => failure,
      );
    }
    if (!failure) await flushWithin(dec.flush().catch((e: unknown) => void (failure ??= errorText(e))));
    if (dec.state !== 'closed') dec.close();
    if (failure) throw new AudioCodecError(failure);
  },
};
