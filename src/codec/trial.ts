// MOD-Codec — trial encodes (ADR-0004 §6 and outcome item 6) and the real first-packet decode that
// makes a source count as decodable (outcome item 5). Browser/worker only (WebCodecs). Promoted from
// SP-codec `probe.js` (trialVideo, trialAudio, extractAsc).
import { audioEncoderConfig, type AudioCodecId } from './configs';
import { supports } from './probe';
import { withNormalisedDescription } from './util';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** If no encoded chunk arrives within this time in 'quality' mode, retry in 'realtime' (item 6). */
export const NO_OUTPUT_MS = 2000;

export type LatencyMode = 'quality' | 'realtime';
export type Acceleration = 'no-preference' | 'prefer-software';

/** What a video trial encode learnt, recorded in the capability record for the session. */
export interface VideoTrial {
  readonly ok: boolean;
  /** The mode every export of the session uses (Safari macOS H.264 needs 'realtime'). */
  readonly latencyMode: LatencyMode | null;
  /** The acceleration setting that worked ('prefer-software' after a failed default, ADR-0004 §5). */
  readonly acceleration: Acceleration | null;
  /** A hardware encoder exists for this config (`prefer-hardware` passes `isConfigSupported`). */
  readonly hardware: boolean;
  /** `bitrateMode`s the encoder accepts. */
  readonly bitrateModes: readonly VideoEncoderBitrateMode[];
  readonly chunks: number;
  readonly firstOutputMs: number | null;
  readonly error: string | null;
}

interface Attempt {
  readonly chunks: number;
  readonly firstOutputMs: number | null;
  readonly error: string | null;
  readonly timedOut: boolean;
}

function painter(w: number, h: number): (i: number) => OffscreenCanvas {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  return (i) => {
    if (ctx) {
      ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect((i * 16) % w, h / 3, w / 8, h / 8);
    }
    return canvas;
  };
}

async function attempt(config: VideoEncoderConfig, frames: number, noOutputMs: number): Promise<Attempt> {
  let chunks = 0;
  let firstOutputMs: number | null = null;
  let error: string | null = null;
  const t0 = performance.now();
  let enc: VideoEncoder | null = null;
  try {
    enc = new VideoEncoder({
      output: () => {
        chunks++;
        firstOutputMs ??= performance.now() - t0;
      },
      error: (e) => {
        error ??= `${e.name}: ${e.message}`;
      },
    });
    enc.configure(config);
    const paint = painter(config.width, config.height);
    const fps = config.framerate ?? 30;
    for (let i = 0; i < frames && !error; i++) {
      const vf = new VideoFrame(paint(i), { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i === 0 });
      vf.close();
    }
    const deadline = t0 + noOutputMs;
    while (chunks === 0 && !error && performance.now() < deadline) await sleep(20);
    if (chunks > 0 && !error) {
      await Promise.race([enc.flush().catch(() => undefined), sleep(noOutputMs)]);
    }
  } catch (e) {
    error ??= e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  try {
    if (enc && enc.state !== 'closed') enc.close();
  } catch {
    /* already closed by an error */
  }
  return { chunks, firstOutputMs, error, timedOut: chunks === 0 && error === null };
}

/**
 * Implements: ADR-0004 §5–6 and outcome item 6 — encode a few frames with `latencyMode: 'quality'`;
 * if no chunk arrives within 2 s, retry with `'realtime'`; if the encoder errors, retry with
 * `'prefer-software'`. Records the working mode, hardware availability and the bitrate modes.
 */
export async function trialVideoEncode(
  config: VideoEncoderConfig,
  { frames = 8, noOutputMs = NO_OUTPUT_MS }: { frames?: number; noOutputMs?: number } = {},
): Promise<VideoTrial> {
  const hardware = await supports(globalThis.VideoEncoder, { ...config, hardwareAcceleration: 'prefer-hardware' });
  const bitrateModes: VideoEncoderBitrateMode[] = [];
  for (const mode of ['constant', 'variable', 'quantizer'] as const) {
    if (await supports(globalThis.VideoEncoder, { ...config, bitrateMode: mode })) bitrateModes.push(mode);
  }
  let last: Attempt | null = null;
  for (const acceleration of ['no-preference', 'prefer-software'] as const) {
    for (const latencyMode of ['quality', 'realtime'] as const) {
      const cfg = { ...config, latencyMode, hardwareAcceleration: acceleration };
      if (!(await supports(globalThis.VideoEncoder, cfg))) continue;
      last = await attempt(cfg, frames, noOutputMs);
      if (last.chunks > 0 && !last.error) {
        return { ok: true, latencyMode, acceleration, hardware, bitrateModes, ...pick(last) };
      }
      if (!last.timedOut) break; // an error: try software rather than the other mode
    }
  }
  return {
    ok: false,
    latencyMode: null,
    acceleration: null,
    hardware,
    bitrateModes,
    chunks: last?.chunks ?? 0,
    firstOutputMs: last?.firstOutputMs ?? null,
    error: last?.error ?? (last?.timedOut ? 'no output' : 'unsupported'),
  };
}

const pick = (a: Attempt) => ({ chunks: a.chunks, firstOutputMs: a.firstOutputMs, error: null });

/** What an audio trial encode learnt (ADR-0004 outcome item 6). */
export interface AudioTrial {
  readonly ok: boolean;
  /** Samples between the input and the decoded output (AAC measured 2112, Opus 312). */
  readonly encoderDelay: number | null;
  /** kbps actually delivered on dense audio (WebKit ignores `bitrate` for AAC). */
  readonly deliveredKbps: number | null;
  /** The encoder's description was an ES_Descriptor and was normalised (WebKit). */
  readonly descriptionNormalised: boolean;
  readonly error: string | null;
}

interface Encoded {
  readonly chunks: EncodedAudioChunk[];
  readonly config: AudioDecoderConfig | null;
  readonly bytes: number;
}

async function encodeAudio(config: AudioEncoderConfig, pcm: Float32Array[]): Promise<Encoded> {
  const chunks: EncodedAudioChunk[] = [];
  let decoderConfig: AudioDecoderConfig | null = null;
  let error: Error | null = null;
  let bytes = 0;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig) decoderConfig = meta.decoderConfig;
      chunks.push(chunk);
      bytes += chunk.byteLength;
    },
    error: (e) => {
      error ??= e;
    },
  });
  enc.configure(config);
  const sr = config.sampleRate;
  const ch = config.numberOfChannels;
  const n = pcm[0]?.length ?? 0;
  for (let off = 0; off < n && !error; off += 1024) {
    const len = Math.min(1024, n - off);
    const planar = new Float32Array(len * ch);
    for (let c = 0; c < ch; c++) planar.set((pcm[c] ?? new Float32Array(n)).subarray(off, off + len), c * len);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: sr,
      numberOfFrames: len,
      numberOfChannels: ch,
      timestamp: Math.round((off * 1e6) / sr),
      data: planar,
    });
    enc.encode(data);
    data.close();
  }
  if (!error) await enc.flush();
  if (enc.state !== 'closed') enc.close();
  if (error) throw error;
  return { chunks, config: decoderConfig, bytes };
}

async function decodeMono(config: AudioDecoderConfig, chunks: readonly EncodedAudioChunk[]): Promise<Float32Array> {
  const parts: Float32Array[] = [];
  let error: Error | null = null;
  const dec = new AudioDecoder({
    output: (a) => {
      const buf = new Float32Array(a.numberOfFrames);
      a.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
      parts.push(buf);
      a.close();
    },
    error: (e) => {
      error ??= e;
    },
  });
  dec.configure(config);
  for (const c of chunks) if (!error) dec.decode(c);
  if (!error) await dec.flush();
  if (dec.state !== 'closed') dec.close();
  if (error) throw error;
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Deterministic dense noise (LCG), so the delivered-rate measure is repeatable. */
function noise(n: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff - 0.5) * 0.8;
  }
  return out;
}

/** Where the impulse is placed (100 ms at 48 kHz). */
export const IMPULSE_AT = 4800;

/**
 * Implements: ADR-0004 outcome item 6 — measure the encoder delay by an impulse round trip, and the
 * delivered bitrate on 2 s of dense audio; the decoder config is normalised (item 4) first.
 */
export async function trialAudioEncode(codec: AudioCodecId, bitrate = 128_000): Promise<AudioTrial> {
  const config = audioEncoderConfig(codec, bitrate);
  const sr = config.sampleRate;
  try {
    const impulse = new Float32Array(sr / 2);
    impulse[IMPULSE_AT] = 0.9;
    const imp = await encodeAudio(config, [impulse, impulse]);
    const raw = imp.config ?? { codec: config.codec, sampleRate: sr, numberOfChannels: 2 };
    const norm = withNormalisedDescription(raw);
    const descriptionNormalised = norm !== raw;
    const out = await decodeMono(norm, imp.chunks);
    let peak = 0;
    for (let i = 1; i < out.length; i++) if (Math.abs(out[i] ?? 0) > Math.abs(out[peak] ?? 0)) peak = i;
    const dense = await encodeAudio(config, [noise(sr * 2, 1), noise(sr * 2, 2)]);
    return {
      ok: true,
      encoderDelay: out.length ? peak - IMPULSE_AT : null,
      deliveredKbps: Math.round((dense.bytes * 8) / 2 / 1000),
      descriptionNormalised,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      encoderDelay: null,
      deliveredKbps: null,
      descriptionNormalised: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}
