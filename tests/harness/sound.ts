// Sound harness (test-only; tests/e2e/audio-decode.spec.ts, preview-playback, export): makes a frame-coded
// clip whose sound track is silence and then a tone from a known time, with the browser's own encoders
// and the container library's writer (ADR-0016 §4: fixtures made by our own encoder; nothing added to
// git). The sound packets are shifted by the encoder's delay so the writer stores an edit list, as
// MOD-Export does (ADR-0008 outcome item 3). Decodes through MOD-Audio's windowed decoder in the page.
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { portFeed, SoundBank, webDecoders } from '../../src/audio';
import { trialAudioEncode, withNormalisedDescription } from '../../src/codec';
import { serveSound } from '../../src/container';

export interface ToneSpec {
  readonly seconds: number;
  /** Where the tone starts (s); silence before. */
  readonly onset: number;
  readonly freq: number;
  readonly amp: number;
  readonly codec: 'aac' | 'opus';
  /** The sound track's rate (Opus is always 48 kHz). */
  readonly sampleRate: 44_100 | 48_000;
  /** Mono instead of stereo. */
  readonly mono?: boolean;
}

const W = 320;
const H = 240;

/** The encoder delay in samples (the trial encode's impulse round trip; AAC 2112, Opus 312). */
const delays = new Map<string, Promise<number>>();
function encoderDelay(codec: 'aac' | 'opus'): Promise<number> {
  let p = delays.get(codec);
  if (!p) {
    p = trialAudioEncode(codec).then((t) => t.encoderDelay ?? (codec === 'aac' ? 2112 : 312));
    delays.set(codec, p);
  }
  return p;
}

/** A 30 fps frame-coded clip with the tone; MP4 (H.264 + AAC) or WebM (VP8 + Opus). */
export async function makeToneClip(spec: ToneSpec): Promise<File> {
  const mp4 = spec.codec === 'aac';
  const sr = spec.codec === 'opus' ? 48_000 : spec.sampleRate;
  const channels = spec.mono ? 1 : 2;
  const target = new BufferTarget();
  const output = new Output({ format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
  const vsrc = new EncodedVideoPacketSource(mp4 ? 'avc' : 'vp8');
  const asrc = new EncodedAudioPacketSource(spec.codec);
  output.addVideoTrack(vsrc, { frameRate: 30 });
  output.addAudioTrack(asrc);
  await output.start();
  const delay = (await encoderDelay(spec.codec)) / 48_000; // seconds (the delay in samples is rate-free)
  const delayS = spec.codec === 'aac' ? (delay * 48_000) / sr : delay;

  // Sound first (the writer interleaves by time).
  const apackets: { p: EncodedPacket; meta?: EncodedAudioChunkMetadata }[] = [];
  let counted = 0;
  let aFail: Error | null = null;
  const aenc = new AudioEncoder({
    output: (c, meta) => {
      const data = new Uint8Array(c.byteLength);
      c.copyTo(data);
      // Stamped by sample count (WebKit's encoder stamps chunks a few ms off at input block edges).
      const frames = Math.round(((c.duration ?? 0) * sr) / 1e6);
      const t = counted / sr - delayS;
      counted += frames;
      apackets.push({
        p: new EncodedPacket(data, 'key', t, frames / sr),
        // WebKit's AAC description is a whole ES_Descriptor: normalised as MOD-Export does (ADR-0004).
        ...(meta?.decoderConfig ? { meta: { decoderConfig: withNormalisedDescription(meta.decoderConfig) } } : {}),
      });
    },
    error: (e) => (aFail = e),
  });
  aenc.configure({ codec: mp4 ? 'mp4a.40.2' : 'opus', sampleRate: sr, numberOfChannels: channels, bitrate: 128_000 });
  const total = Math.round(spec.seconds * sr);
  const block = 4800;
  for (let at = 0; at < total; at += block) {
    const n = Math.min(block, total - at);
    const planar = new Float32Array(n * channels);
    for (let i = 0; i < n; i++) {
      const t = (at + i) / sr;
      const v = t >= spec.onset ? spec.amp * Math.sin(2 * Math.PI * spec.freq * (t - spec.onset)) : 0;
      for (let c = 0; c < channels; c++) planar[c * n + i] = v;
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((at * 1e6) / sr),
      data: planar,
    });
    aenc.encode(data);
    data.close();
  }
  await aenc.flush();
  aenc.close();
  if (aFail) throw aFail;

  const vpackets: { p: EncodedPacket; meta?: EncodedVideoChunkMetadata }[] = [];
  const venc = new VideoEncoder({
    output: (c, meta) => vpackets.push({ p: EncodedPacket.fromEncodedChunk(c), ...(meta ? { meta } : {}) }),
    error: (e) => (aFail = e),
  });
  venc.configure(
    mp4
      ? {
          codec: 'avc1.42001e',
          width: W,
          height: H,
          bitrate: 1_000_000,
          framerate: 30,
          latencyMode: 'realtime',
          avc: { format: 'avc' },
        }
      : { codec: 'vp8', width: W, height: H, bitrate: 1_000_000, framerate: 30 },
  );
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d')!;
  const frames = Math.round(spec.seconds * 30);
  for (let k = 0; k < frames; k++) {
    g.fillStyle = `hsl(${(k * 37) % 360} 70% 45%)`;
    g.fillRect(0, 0, W, H);
    const ts = Math.floor((k * 1e6) / 30);
    const f = new VideoFrame(canvas, { timestamp: ts, duration: Math.floor(((k + 1) * 1e6) / 30) - ts });
    venc.encode(f, { keyFrame: k % 30 === 0 });
    f.close();
    if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
  }
  await venc.flush();
  venc.close();
  if (aFail) throw aFail;
  // Interleave by time.
  let a = 0;
  let v = 0;
  while (a < apackets.length || v < vpackets.length) {
    const ta = apackets[a]?.p.timestamp ?? Infinity;
    const tv = vpackets[v]?.p.timestamp ?? Infinity;
    if (ta <= tv) {
      const x = apackets[a++]!;
      await asrc.add(x.p, x.meta);
    } else {
      const x = vpackets[v++]!;
      await vsrc.add(x.p, x.meta);
    }
  }
  await output.finalize();
  return new File([target.buffer ?? new ArrayBuffer(0)], mp4 ? 'tone.mp4' : 'tone.webm', {
    type: mp4 ? 'video/mp4' : 'video/webm',
  });
}

/** What a decoded tone looks like (48 kHz, channel L). */
export interface ToneReport {
  /** First sample reaching half the tone's amplitude, in seconds of source time. */
  readonly onset: number;
  /** RMS before the onset (−∞ for digital silence) and on the steady tone, in dBFS. */
  readonly beforeDb: number;
  readonly toneDb: number;
  /** Frequency by zero crossings over the steady tone. */
  readonly freq: number;
  /** R − L, largest difference. */
  readonly sideMax: number;
}

const dbOf = (x: number) => 20 * Math.log10(x);

/** Analyses [from, from + L.length) of a decoded tone at 48 kHz whose onset should be near `onset`. */
export function analyseTone(L: Float32Array, R: Float32Array, from: number, spec: ToneSpec): ToneReport {
  const at = (s: number) => Math.round(s * 48_000) - from;
  let onset = Number.NaN;
  for (let i = Math.max(0, at(spec.onset - 0.2)); i < L.length; i++)
    if (Math.abs(L[i]!) >= spec.amp / 2) {
      onset = (from + i) / 48_000;
      break;
    }
  const rms = (a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += L[i]! * L[i]!;
    return Math.sqrt(s / Math.max(1, b - a));
  };
  const a = at(spec.onset + 0.2);
  const b = Math.min(L.length, at(spec.onset + 0.8));
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = a + 1; i < b; i++)
    if (L[i - 1]! < 0 && L[i]! >= 0) {
      const x = i - 1 + L[i - 1]! / (L[i - 1]! - L[i]!);
      if (first < 0) first = x;
      last = x;
      crossings++;
    }
  let side = 0;
  for (let i = 0; i < L.length; i++) side = Math.max(side, Math.abs(R[i]! - L[i]!));
  return {
    onset,
    beforeDb: Math.max(-300, dbOf(rms(Math.max(0, at(spec.onset - 0.5)), at(spec.onset - 0.05)))),
    toneDb: dbOf(rms(a, b)),
    freq: crossings > 1 ? ((crossings - 1) * 48_000) / (last - first) : 0,
    sideMax: side,
  };
}

/** Decodes [from, from + seconds) of a file's sound with MOD-Audio's windowed decoder (in the page). */
export async function decodeWindow(file: Blob, from: number, seconds: number): Promise<[Float32Array, Float32Array]> {
  const ch = new MessageChannel();
  const server = serveSound(ch.port1, () => file);
  const bank = new SoundBank(portFeed(ch.port2), webDecoders);
  bank.setSources(['s']);
  const d = [{ sourceId: 's', from: Math.round(from * 48_000), to: Math.round((from + seconds) * 48_000) }];
  bank.want(d);
  await bank.until(d);
  const failure = bank.failureOf(d);
  const L = new Float32Array(d[0]!.to - d[0]!.from);
  const R = new Float32Array(L.length);
  bank.get('s')?.read(d[0]!.from, L, R);
  bank.dispose();
  server.close();
  ch.port1.close();
  ch.port2.close();
  if (failure) throw new Error(failure);
  return [L, R];
}

export const soundHarness = {
  /** Decodes a generated tone clip from `from` and reports the tone (and the file's format). */
  async decodeTone(spec: ToneSpec, from = 0): Promise<ToneReport & { bytes: number; seekDiff: number; mime: string }> {
    const file = await makeToneClip(spec);
    const [L, R] = await decodeWindow(file, from, spec.seconds - from);
    const report = analyseTone(L, R, Math.round(from * 48_000), spec);
    // A window started by a seek (1.6 s, inside the tone) against the decode from the start.
    const seekAt = 1.6;
    const [sL] = await decodeWindow(file, seekAt, 0.5);
    const off = Math.round((seekAt - from) * 48_000);
    let seekDiff = 0;
    for (let i = 0; i < sL.length; i++) seekDiff = Math.max(seekDiff, Math.abs(sL[i]! - L[off + i]!));
    return { ...report, bytes: file.size, seekDiff, mime: file.type };
  },
  /** The generated clip's bytes (for a test to add it through the file picker). */
  async toneClipBytes(spec: ToneSpec): Promise<number[]> {
    return Array.from(new Uint8Array(await (await makeToneClip(spec)).arrayBuffer()));
  },
  canEncode: async (codec: 'aac' | 'opus', sampleRate: number) =>
    (
      await AudioEncoder.isConfigSupported({
        codec: codec === 'aac' ? 'mp4a.40.2' : 'opus',
        sampleRate,
        numberOfChannels: 2,
        bitrate: 128_000,
      })
    ).supported === true,
};
