// Export harness (test-only; tests/e2e/export-*.spec.ts): MOD-Export and MOD-Scratch in real engines.
// A frame-coded clip is made in the page (tests/harness/video.ts) and its sound is generated, so nothing
// is added to git. Exports run through MOD-Export's main-thread side and its two real workers; results
// are read back with MOD-Container and compared with the compositor's paint (the preview's picture).
import { endSampleOf, pcmSource, truePeak, TruePeakMeter, type SoundSource } from '../../src/audio';
import { looks as readLooks, musicBlob } from '../../src/assets';
import {
  chooseAudioFormat,
  chooseVideoFormat,
  probeCapabilities,
  trialAudioEncode,
  trialVideoEncode,
  videoEncoderConfig,
  withNormalisedDescription,
} from '../../src/codec';
import { createCompositor, decodeLookStrip } from '../../src/compositor';
import { createOutput, openInput, type OutPacket } from '../../src/container';
import {
  DEFAULT_PLACEMENT,
  frameAspect,
  videoOutputSize,
  layoutOf,
  frameStart,
  projectFrames,
  type Adjustments,
  type EngineMedia,
  type Look,
  type ExportSettings,
  type Frame,
  type PcmSource,
  type Placement,
  type Project,
} from '../../src/core';
import {
  estimate,
  ExportWorkers,
  LateAudioMux,
  wavAudio,
  type EstimateResult,
  MemorySpill,
  start,
  type ExportCaps,
  type ExportContext,
  type ExportResult,
} from '../../src/export';
import { FrameSource } from '../../src/export/pipeline';
// F-010: the bundled typefaces (ADR-0012) for the text export; MOD-Host loads every face, as the app does.
import '../../src/app/styles/fonts.css';
import { loadFonts } from '../../src/host/fonts';
import { rasteriseText, textBitmaps, TEXT_FACES } from '../../src/preview';
import { framePlan, voices } from '../../src/plan';
import { browserScratchEnv, browserStorage, lockName, Scratch, SCRATCH_DIR } from '../../src/scratch';
import { de00, lab, type Rgb } from '../support/colour';
import { analyseTone, decodeWindow, makeToneClip, type ToneReport, type ToneSpec } from './sound';
import { CLIP_H, CLIP_W, codedProject, makeClip, readCode } from './video';

let capsCache: Promise<ExportCaps> | null = null;
const scratch = new Scratch(browserScratchEnv());
let workers: ExportWorkers | null = null;

/** The capability record as the app builds it: probe, format choice and trial encodes. */
function caps(): Promise<ExportCaps> {
  return (capsCache ??= (async () => {
    const c = await probeCapabilities();
    const videoFormat = chooseVideoFormat(c, true);
    if (!videoFormat) throw new Error('no video format');
    const trial = await trialVideoEncode(videoEncoderConfig(videoFormat.video, 640, 480, 30));
    const audio: ExportCaps['audio'] = {};
    for (const codec of ['aac', 'opus'] as const)
      if (c.audioEncode[codec]) {
        const t = await trialAudioEncode(codec);
        if (t.ok && t.encoderDelay !== null)
          audio[codec] = { encoderDelay: t.encoderDelay, deliveredKbps: t.deliveredKbps };
      }
    return {
      videoFormat,
      audioFormat: chooseAudioFormat(c),
      video: {
        latencyMode: trial.latencyMode ?? 'realtime',
        acceleration: trial.acceleration ?? 'no-preference',
        bitrateModes: trial.bitrateModes,
      },
      audio,
    };
  })());
}

/** A loud two-tone sound whose raw sum peaks near +3.5 dBFS (the limiter and the trim have work to do). */
function loudPcm(seconds: number): PcmSource {
  const n = Math.ceil(seconds * 48_000);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 48_000;
    L[i] = 0.95 * Math.sin(2 * Math.PI * 997 * t) + 0.55 * Math.sin(2 * Math.PI * 7919 * t);
    R[i] = 0.9 * Math.sin(2 * Math.PI * 1499 * t + 0.3) + 0.6 * Math.sin(2 * Math.PI * 11_003 * t);
  }
  return { sourceId: 'src-a', L, R };
}

interface Options {
  readonly frames: number;
  readonly settings: ExportSettings;
  readonly sound: boolean;
  /** Cancel when this fraction of progress is reported. */
  readonly cancelAt?: number;
  readonly scratch?: boolean;
  /** Overrides of the capability record (e.g. force the WebM or Ogg fallback formats). */
  readonly caps?: Partial<ExportCaps>;
  /** Add a second sound (an audio clip over the whole project) for the mix checks. */
  readonly music?: boolean;
  /** Ask the panel's estimate first (F-015.AC11). */
  readonly estimate?: boolean;
  /** Dense, music-like sound (noise) instead of two tones: what the delivered AAC rate is measured on. */
  readonly dense?: boolean;
  /** The clip's in point (µs of source time; F-004.AC7), instead of 0. */
  readonly inPoint?: number;
}

export interface FrameCheck {
  readonly k: number;
  readonly code: number;
  readonly deMean: number;
  readonly deMax: number;
}

export interface RunReport {
  readonly result: ExportResult | { ok: false; error: string };
  readonly estimated: EstimateResult | null;
  readonly metadata: MetadataReport | null;
  readonly wavMatchesMix: boolean | null;
  readonly ms: number;
  readonly cancelMs: number | null;
  readonly progress: number[];
  readonly remaining: (number | null)[];
  readonly scratchFile: string | null;
  readonly spillFile: string | null;
  readonly namesAfter: string[];
  readonly gif: GifReport | null;
  readonly file: {
    readonly bytes: number;
    readonly format: string;
    readonly duration: number;
    readonly video: {
      codec: string;
      width: number;
      height: number;
      packets: number;
      timestamps: number[];
      keys: number;
    } | null;
    readonly audio: {
      codec: string;
      firstTimestamp: number;
      packets: number;
      end: number;
      truePeakDb: number;
      decodedSamples: number;
    } | null;
    readonly frames: FrameCheck[];
  } | null;
}

let lastBlob: Blob | null = null;

/** Deterministic dense noise (LCG), like the trial's delivered-rate measure. */
function densePcm(seconds: number): PcmSource {
  const n = Math.ceil(seconds * 48_000);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    L[i] = (x / 0xffffffff - 0.5) * 0.6;
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    R[i] = (x / 0xffffffff - 0.5) * 0.6;
  }
  return { sourceId: 'src-a', L, R };
}

/** A second, quieter sound (the "music" of the mix checks). */
function musicPcm(seconds: number): PcmSource {
  const n = Math.ceil(seconds * 48_000);
  const L = Float32Array.from({ length: n }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 220 * i) / 48_000));
  return { sourceId: 'src-m', L, R: L.slice() };
}

/** F-016.AC2: the WAV's samples are the RULE-12 mix of the project (the same render, dithered). */
async function wavMatches(blob: Blob, project: Project, pcm: readonly PcmSource[]): Promise<boolean> {
  const sources = new Map<string, SoundSource>(pcm.map((p) => [p.sourceId, pcmSource(p.L, p.R)]));
  const parts: Uint8Array[] = [];
  await wavAudio({ voices: voices(project), bank: (id) => sources.get(id), endSample: endSampleOf(project) }, (b) =>
    parts.push(b),
  );
  const file = new Uint8Array(await blob.arrayBuffer()).subarray(44);
  let at = 0;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) if (file[at + i] !== part[i]) return false;
    at += part.length;
  }
  return at === file.length;
}

export interface MetadataReport {
  readonly library: boolean;
  readonly sourceName: boolean;
  /** MP4 boxes whose creation or modification time is not 0. */
  readonly times: string[];
  /** Metadata containers present: MP4 udta/meta, WebM Tags, WAV LIST. */
  readonly tags: string[];
}

/** F-015.AC4: what an output says beyond what its format requires. */
async function metadataCheck(blob: Blob): Promise<MetadataReport> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(b);
  const times: string[] = [];
  const tags: string[] = [];
  const isMp4 = text.slice(4, 8) === 'ftyp';
  const walk = (from: number, to: number): void => {
    for (let at = from; at + 8 <= to;) {
      const v = new DataView(b.buffer, at);
      let size = v.getUint32(0);
      const type = text.slice(at + 4, at + 8);
      if (size === 1) size = Number(v.getBigUint64(8));
      if (size === 0) size = to - at;
      if (size < 8) return;
      if (type === 'udta' || type === 'meta') tags.push(type);
      if (type === 'mvhd' || type === 'tkhd' || type === 'mdhd') {
        const version = b[at + 8];
        const c =
          version === 1 ? Number(v.getBigUint64(12)) + Number(v.getBigUint64(20)) : v.getUint32(12) + v.getUint32(16);
        if (c !== 0) times.push(type);
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'].includes(type)) walk(at + 8, at + size);
      at += size;
    }
  };
  if (isMp4) walk(0, b.length);
  if (text.startsWith('\x1aE\xdf\xa3') && text.includes('\x12\x54\xc3\x67')) tags.push('Tags');
  if (text.startsWith('RIFF') && text.includes('LIST')) tags.push('LIST');
  return {
    library: /mediabunny/i.test(text),
    sourceName: text.includes('coded.mp4') || text.includes('coded.webm'),
    times,
    tags,
  };
}

export interface GifReport {
  readonly header: string;
  readonly loop: number | null;
  readonly delays: number[];
  readonly images: number;
  readonly width: number;
  readonly height: number;
  /** Frame codes read from decoded frames (ImageDecoder), where the engine has it. */
  readonly codes: number[] | null;
}

/** Walks the GIF blocks: the Netscape loop count, every frame's delay (cs), the image count. */
async function analyseGif(blob: Blob): Promise<GifReport> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const header = String.fromCharCode(...b.subarray(0, 6));
  const width = b[6]! | (b[7]! << 8);
  const height = b[8]! | (b[9]! << 8);
  let i = 13;
  if (b[10]! & 0x80) i += 3 * (1 << ((b[10]! & 7) + 1));
  const delays: number[] = [];
  let loop: number | null = null;
  let images = 0;
  const skipSub = (): void => {
    while (b[i]! !== 0) i += b[i]! + 1;
    i++;
  };
  while (i < b.length && b[i] !== 0x3b) {
    if (b[i] === 0x21) {
      const label = b[i + 1];
      if (label === 0xf9) delays.push(b[i + 4]! | (b[i + 5]! << 8));
      if (label === 0xff && String.fromCharCode(...b.subarray(i + 3, i + 14)) === 'NETSCAPE2.0')
        loop = b[i + 16]! | (b[i + 17]! << 8);
      i += 2;
      skipSub();
    } else if (b[i] === 0x2c) {
      images++;
      const packed = b[i + 9]!;
      i += 10;
      if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1));
      i++; // LZW minimum code size
      skipSub();
    } else break;
  }
  let codes: number[] | null = null;
  const ID = (
    globalThis as {
      ImageDecoder?: new (o: { data: ArrayBuffer; type: string }) => {
        decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }>;
      };
    }
  ).ImageDecoder;
  if (ID) {
    codes = [];
    const dec = new ID({ data: b.slice().buffer, type: 'image/gif' });
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    for (let f = 0; f < images; f++) {
      const { image } = await dec.decode({ frameIndex: f });
      g.drawImage(image, 0, 0);
      image.close();
      codes.push(readCode(new Uint8Array(g.getImageData(0, 0, width, height).data.buffer), width, height));
    }
  }
  return { header, loop, delays, images, width, height, codes };
}

async function run(o: Options): Promise<RunReport> {
  const clip = await makeClip({ rate: 30, frames: o.frames, gop: 30 });
  const coded = codedProject({ rate: 30, frames: o.frames, gop: 30 });
  const seconds = o.frames / 30;
  const project: Project = {
    ...coded,
    // F-004.AC7: the clip trimmed at its start to a source time.
    clips: coded.clips.map((c) => (o.inPoint === undefined ? c : { ...c, in: o.inPoint })),
    sources: [
      ...coded.sources.map((src) => ({ ...src, hasSound: o.sound })),
      ...(o.music
        ? [{ id: 'src-m', kind: 'audio' as const, name: 'm', bytes: 1, duration: (seconds + 1) * 1e6, hasSound: true }]
        : []),
    ],
    audioClips: o.music
      ? [
          {
            id: 'm',
            sourceId: 'src-m',
            start: 0,
            in: 0,
            out: Math.round(seconds * 1e6),
            volume: 60,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ]
      : [],
  };
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const ctx: ExportContext = {
    workers,
    scratch: o.scratch === false ? new Scratch({ ...browserScratchEnv(), storage: null }) : scratch,
    caps: { ...(await caps()), ...o.caps },
    media: [{ id: 'src-a', kind: 'video', file: clip }],
    pcm: [
      ...(o.sound ? [o.dense ? densePcm(seconds + 1) : loudPcm(seconds + 1)] : []),
      ...(o.music ? [musicPcm(seconds + 1)] : []),
    ],
    looks: {},
    texts: () => ({}),
    phone: false,
    gains: new Map(),
    save: (blob) => {
      saved = blob;
      return URL.createObjectURL(blob);
    },
  };
  const estimated = o.estimate ? await estimate(project, o.settings, ctx) : null;
  const t0 = performance.now();
  const handle = await start(project, o.settings, ctx);
  const progress: number[] = [];
  const remaining: (number | null)[] = [];
  let cancelMs: number | null = null;
  handle.onProgress((v) => {
    progress.push(v.fraction);
    remaining.push(v.remainingMs);
    if (o.cancelAt !== undefined && v.fraction >= o.cancelAt && cancelMs === null) {
      cancelMs = -1;
      const c0 = performance.now();
      void handle.cancel().then(() => (cancelMs = performance.now() - c0));
    }
  });
  const result = await handle.result;
  const ms = performance.now() - t0;
  while (cancelMs === -1) await new Promise((r) => setTimeout(r, 5));
  await handle.cleaned;
  const namesAfter = await scratch.names();
  lastBlob = saved;
  return {
    result,
    estimated,
    ms,
    cancelMs,
    metadata: saved ? await metadataCheck(saved) : null,
    wavMatchesMix:
      saved && o.settings.kind === 'audio' && o.settings.format === 'wav'
        ? await wavMatches(saved, project, ctx.pcm ?? [])
        : null,
    progress,
    remaining,
    scratchFile: handle.scratchFile?.name ?? null,
    spillFile: handle.scratchFile?.spill ?? null,
    namesAfter,
    gif: saved && o.settings.kind === 'gif' ? await analyseGif(saved) : null,
    file: saved && o.settings.kind !== 'gif' ? await analyse(saved, project, clip) : null,
  };
}

/** Uniform patch centres of the coded picture: the ten code blocks and a grid on the hue below. */
function patchPoints(W: number, H: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let b = 0; b < 10; b++) pts.push([Math.floor(((b + 0.5) * W) / 10), Math.floor(H / 4)]);
  for (let gx = 1; gx <= 5; gx++)
    for (let gy = 1; gy <= 2; gy++) pts.push([Math.floor((gx * W) / 6), Math.floor(H / 2 + (gy * H) / 6)]);
  return pts;
}

async function analyse(blob: Blob, project: Project, clip: File): Promise<NonNullable<RunReport['file']>> {
  const input = await openInput(blob);
  const v = input.video;
  const a = input.audio;
  const vPackets: { t: number; key: boolean; data: Uint8Array; d: number }[] = [];
  if (v)
    for await (const p of input.packets('video'))
      vPackets.push({ t: p.timestamp, key: p.key, data: p.data, d: p.duration });
  let audio: NonNullable<RunReport['file']>['audio'] = null;
  if (a) {
    const meter = new TruePeakMeter();
    let decodedSamples = 0;
    const dec = new AudioDecoder({
      output: (d) => {
        const planes = [0, 1].map((c) => {
          const x = new Float32Array(d.numberOfFrames);
          d.copyTo(x, { planeIndex: Math.min(c, d.numberOfChannels - 1), format: 'f32-planar' });
          return x;
        });
        decodedSamples += d.numberOfFrames;
        d.close();
        meter.push(planes);
      },
      error: () => undefined,
    });
    dec.configure(a.decoderConfig);
    let n = 0;
    let end = 0;
    for await (const p of input.packets('audio')) {
      dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(p.timestamp * 1e6), data: p.data }));
      n++;
      end = Math.max(end, p.timestamp + p.duration);
    }
    await dec.flush();
    dec.close();
    audio = {
      codec: a.codec,
      firstTimestamp: a.firstTimestamp,
      packets: n,
      end,
      truePeakDb: meter.finish().dB,
      decodedSamples,
    };
  }
  const frames: FrameCheck[] = [];
  if (v) {
    const W = v.displayWidth;
    const H = v.displayHeight;
    const n = vPackets.length;
    const want = new Set([0, 1, 2, 14, 15, 29, 30, Math.floor(n / 2), n - 2, n - 1].filter((k) => k >= 0 && k < n));
    const decoded = new Map<number, Uint8ClampedArray>();
    const canvas = new OffscreenCanvas(W, H);
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    let index = 0;
    const dec = new VideoDecoder({
      output: (f) => {
        const k = Math.round((f.timestamp * 30) / 1e6);
        if (want.has(k)) {
          g.drawImage(f, 0, 0, W, H);
          decoded.set(k, g.getImageData(0, 0, W, H).data);
        }
        index++;
        f.close();
      },
      error: () => undefined,
    });
    dec.configure(v.decoderConfig);
    for (const p of vPackets)
      dec.decode(
        new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: Math.round(p.t * 1e6), data: p.data }),
      );
    await dec.flush();
    dec.close();
    // The preview's picture: the same plan painted by the compositor at the same size.
    const comp = createCompositor(new OffscreenCanvas(W, H), new Map(), { preserve: true });
    const source = new FrameSource([{ id: 'src-a', kind: 'video', file: clip }]);
    for (const k of [...want].sort((x, y) => x - y)) {
      const plan = framePlan(project, k);
      comp.paint(plan, await source.frames(plan));
      const ref = comp.readPixels();
      const got = decoded.get(k);
      if (!got) continue;
      const des = patchPoints(W, H).map(([x, y]) => {
        const i = (y * W + x) * 4;
        const rgb = (px: ArrayLike<number>): Rgb => [px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255];
        return de00(lab(rgb(got)), lab(rgb(ref)));
      });
      frames.push({
        k,
        code: readCode(new Uint8Array(got.buffer), W, H),
        deMean: des.reduce((s, x) => s + x, 0) / des.length,
        deMax: Math.max(...des),
      });
    }
    await source.close();
    comp.dispose();
    void index;
  }
  input.close();
  return {
    bytes: blob.size,
    format: input.format,
    duration: input.duration,
    video: v
      ? {
          codec: v.codec,
          width: v.displayWidth,
          height: v.displayHeight,
          packets: vPackets.length,
          timestamps: vPackets.map((p) => Math.round(p.t * 1e6)),
          keys: vPackets.filter((p) => p.key).length,
        }
      : null,
    audio,
    frames,
  };
}

/** Encoded video and sound for the late-sound mux check (ADR-0010 outcome item 1). */
async function encodedParts(frames: number, seconds: number) {
  const video: { p: OutPacket; config?: VideoDecoderConfig }[] = [];
  const venc = new VideoEncoder({
    output: (c, meta) => {
      const data = new Uint8Array(c.byteLength);
      c.copyTo(data);
      video.push({
        p: { data, timestamp: c.timestamp / 1e6, duration: (c.duration ?? 0) / 1e6, key: c.type === 'key' },
        ...(meta?.decoderConfig ? { config: meta.decoderConfig } : {}),
      });
    },
    error: () => undefined,
  });
  venc.configure({
    codec: 'avc1.42001e',
    width: CLIP_W,
    height: CLIP_H,
    bitrate: 1_000_000,
    framerate: 30,
    latencyMode: 'realtime',
    avc: { format: 'avc' },
  });
  const canvas = new OffscreenCanvas(CLIP_W, CLIP_H);
  const g = canvas.getContext('2d')!;
  for (let k = 0; k < frames; k++) {
    g.fillStyle = `hsl(${k * 7} 60% 50%)`;
    g.fillRect(0, 0, CLIP_W, CLIP_H);
    const f = new VideoFrame(canvas, {
      timestamp: frameStart(k, 30),
      duration: frameStart(k + 1, 30) - frameStart(k, 30),
    });
    venc.encode(f, { keyFrame: k % 30 === 0 });
    f.close();
  }
  await venc.flush();
  venc.close();
  const audio: OutPacket[] = [];
  let aconfig: AudioDecoderConfig | null = null;
  const aenc = new AudioEncoder({
    output: (c, meta) => {
      if (meta?.decoderConfig && !aconfig) aconfig = meta.decoderConfig;
      const data = new Uint8Array(c.byteLength);
      c.copyTo(data);
      audio.push({ data, timestamp: c.timestamp / 1e6 - 2112 / 48_000, duration: (c.duration ?? 0) / 1e6, key: true });
    },
    error: () => undefined,
  });
  aenc.configure({ codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });
  const pcm = loudPcm(seconds);
  for (let at = 0; at < pcm.L.length; at += 4800) {
    const n = Math.min(4800, pcm.L.length - at);
    const d = new Float32Array(2 * n);
    d.set(pcm.L.subarray(at, at + n).map((x) => x * 0.3));
    d.set(
      pcm.R.subarray(at, at + n).map((x) => x * 0.3),
      n,
    );
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: 48_000,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((at * 1e6) / 48_000),
      data: d,
    });
    aenc.encode(ad);
    ad.close();
  }
  await aenc.flush();
  aenc.close();
  return { video, audio, aconfig: withNormalisedDescription(aconfig!) };
}

/**
 * ADR-0008 §6 / build question 33: an export of a clip whose sound is decoded from its file (no PCM given):
 * the tone clip of tests/harness/sound.ts exported as it is, and the file read back (MOD-Audio's decoder,
 * or the WAV samples). F-005.AC2: `speedPct` plays the clip at that speed (RULE-06); the tone is then
 * analysed at its project time (onset ÷ speed) and the decoded length is the source's ÷ speed.
 */
async function runTone(
  settings: ExportSettings,
  spec: ToneSpec,
  speedPct = 100,
): Promise<{
  result: ExportResult | { ok: false; error: string };
  tone: ToneReport | null;
  container: string | null;
  decodedSeconds: number;
  /** The exported file's length (MP4: its longest track; WAV: its samples), seconds. */
  fileSeconds: number;
  /** RMS over the last 0.15–0.05 s of the decoded sound, dBFS (the tone lasts to the end). */
  tailDb: number;
}> {
  const file = await makeToneClip(spec);
  const coded = codedProject({ rate: 30, frames: Math.round(spec.seconds * 30), gop: 30 });
  const project: Project = {
    ...coded,
    sources: coded.sources.map((s) => ({ ...s, hasSound: true, duration: Math.round(spec.seconds * 1e6) })),
    clips: coded.clips.map((c) => ({ ...c, speedPct })),
  };
  const speed = speedPct / 100;
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const handle = await start(project, settings, {
    workers,
    scratch,
    caps: await caps(),
    media: [{ id: 'src-a', kind: 'video', file }],
    looks: {},
    texts: () => ({}),
    phone: false,
    gains: new Map(),
    save: (blob) => {
      saved = blob;
      return URL.createObjectURL(blob);
    },
  });
  const result = await handle.result;
  await handle.cleaned;
  const blob = saved as Blob | null;
  if (!blob) return { result, tone: null, container: null, decodedSeconds: 0, fileSeconds: 0, tailDb: -Infinity };
  let L: Float32Array;
  let R: Float32Array;
  let container: string;
  let fileSeconds: number;
  if (settings.kind === 'audio' && settings.format === 'wav') {
    const v = new DataView(await blob.arrayBuffer());
    const n = (v.byteLength - 44) / 4;
    L = new Float32Array(n);
    R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = v.getInt16(44 + i * 4, true) / 32768;
      R[i] = v.getInt16(46 + i * 4, true) / 32768;
    }
    container = 'WAV';
    fileSeconds = n / 48_000;
  } else {
    const input = await openInput(blob);
    container = input.format;
    fileSeconds = input.duration;
    input.close();
    [L, R] = await decodeWindow(blob, 0, spec.seconds / speed);
  }
  const heard = analyseTone(L, R, 0, { ...spec, onset: spec.onset / speed });
  const tail = L.subarray(Math.max(0, L.length - 7200), Math.max(0, L.length - 2400));
  const tailDb = 10 * Math.log10(tail.reduce((a, x) => a + x * x, 0) / Math.max(1, tail.length));
  return { result, tone: heard, container, decodedSeconds: L.length / 48_000, fileSeconds, tailDb };
}

/** F-011: the sound settings of runMix's one tone clip, and an optional bundled track over it. */
export interface MixSpec {
  /** The video clip's volume (RULE-12, %), and whether it is muted. */
  readonly volume?: number;
  readonly muted?: boolean;
  /** A bundled track (ENT-MusicTrack id) placed at 0 for the whole project, at this volume. */
  readonly music?: { readonly id: string; readonly volume: number };
}

export interface MixReport {
  readonly ok: boolean;
  /** RMS of the decoded export over [from, to) seconds, in dBFS (−∞ for digital silence). */
  readonly rmsDb: number;
  /** True peak of the whole decoded export (BS.1770-4 meter), dBTP. */
  readonly truePeakDb: number;
}

/**
 * F-011.AC3/AC5/AC10 (export half): the tone clip of tests/harness/sound.ts exported with its RULE-12
 * volume or mute, and optionally a bundled track (read by MOD-Assets from its packaged file and decoded
 * like any source, Q87), through the real export workers; the file is decoded back and measured.
 */
async function runMix(
  settings: ExportSettings,
  spec: ToneSpec,
  mix: MixSpec,
  window: readonly [number, number],
): Promise<MixReport> {
  const file = await makeToneClip(spec);
  const coded = codedProject({ rate: 30, frames: Math.round(spec.seconds * 30), gop: 30 });
  const length = Math.round(spec.seconds * 1e6);
  const project: Project = {
    ...coded,
    sources: coded.sources.map((s) => ({ ...s, hasSound: true, duration: length })),
    clips: coded.clips.map((c) => ({
      ...c,
      ...(mix.volume !== undefined ? { volume: mix.volume } : {}),
      ...(mix.muted !== undefined ? { muted: mix.muted } : {}),
    })),
    audioClips: mix.music
      ? [
          {
            id: 'music-1',
            sourceId: mix.music.id,
            start: 0,
            in: 0,
            out: length,
            volume: mix.music.volume,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ]
      : [],
  };
  const media: EngineMedia[] = [{ id: 'src-a', kind: 'video', file }];
  if (mix.music) media.push({ id: mix.music.id, kind: 'audio', file: await musicBlob(mix.music.id) });
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const handle = await start(project, settings, {
    workers,
    scratch,
    caps: await caps(),
    media,
    looks: {},
    texts: () => ({}),
    phone: false,
    gains: new Map(),
    save: (blob) => {
      saved = blob;
      return URL.createObjectURL(blob);
    },
  });
  const result = await handle.result;
  await handle.cleaned;
  const blob = saved as Blob | null;
  if (!result.ok || !blob) return { ok: false, rmsDb: Number.NaN, truePeakDb: Number.NaN };
  const [L, R] = await decodeWindow(blob, 0, spec.seconds);
  const a = Math.round(window[0] * 48_000);
  const b = Math.min(L.length, Math.round(window[1] * 48_000));
  let sum = 0;
  for (let i = a; i < b; i++) sum += (L[i]! * L[i]! + R[i]! * R[i]!) / 2;
  return {
    ok: true,
    rmsDb: 10 * Math.log10(sum / Math.max(1, b - a)),
    truePeakDb: truePeak([L, R]).dB,
  };
}

/** A picture sample: RGB 0–255. */
export type Sample = readonly [number, number, number];

/** F-012.AC6: the frame-fill export's picture and the preview's paint at the same points. */
export interface FrameFillReport {
  readonly ok: boolean;
  readonly width: number;
  readonly height: number;
  /** The exported file's frame `k`, decoded, at each point. */
  readonly exported: Sample[];
  /** The compositor's paint of the same plan at the same size (what the preview shows, INV-02). */
  readonly painted: Sample[];
}

/**
 * F-012.AC6 (export half): the frame-coded 4:3 clip, fitted (RULE-07 Fit) in a frame with the given
 * aspect and background, exported at 480p Balanced through the real export workers; frame `k` of the
 * file is decoded and sampled at `points` (fractions of the width and height), next to the
 * compositor's paint of the same plan. F-006: `placement` places the clip (rotation, flips, Fill, scale,
 * offset; RULE-07) in the file and in the paint alike (INV-02).
 */
async function frameFill(
  frame: Partial<Frame>,
  points: readonly (readonly [number, number])[],
  k = 15,
  placement: Partial<Placement> = {},
): Promise<FrameFillReport> {
  const frames = 30;
  const clip = await makeClip({ rate: 30, frames, gop: 30 });
  const coded = codedProject({ rate: 30, frames, gop: 30 });
  const clips = coded.clips.map((c) => ({ ...c, placement: { ...c.placement, ...placement } }));
  const project: Project = { ...coded, clips, frame: { ...coded.frame, ...frame } };
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const handle = await start(
    project,
    { kind: 'video', resolution: 480, quality: 'balanced' },
    {
      workers,
      scratch,
      caps: await caps(),
      media: [{ id: 'src-a', kind: 'video', file: clip }],
      pcm: [],
      looks: {},
      texts: () => ({}),
      phone: false,
      gains: new Map(),
      save: (blob) => {
        saved = blob;
        return URL.createObjectURL(blob);
      },
    },
  );
  const result = await handle.result;
  await handle.cleaned;
  const blob = saved as Blob | null;
  if (!result.ok || !blob) return { ok: false, width: 0, height: 0, exported: [], painted: [] };
  const input = await openInput(blob);
  const v = input.video!;
  const W = v.displayWidth;
  const H = v.displayHeight;
  const at = (px: ArrayLike<number>): Sample[] =>
    points.map(([fx, fy]) => {
      const i = (Math.min(H - 1, Math.floor(fy * H)) * W + Math.min(W - 1, Math.floor(fx * W))) * 4;
      return [px[i]!, px[i + 1]!, px[i + 2]!];
    });
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  let exported: Sample[] = [];
  const dec = new VideoDecoder({
    output: (f) => {
      if (Math.round((f.timestamp * 30) / 1e6) === k) {
        g.drawImage(f, 0, 0, W, H);
        exported = at(g.getImageData(0, 0, W, H).data);
      }
      f.close();
    },
    error: () => undefined,
  });
  dec.configure(v.decoderConfig);
  for await (const p of input.packets('video'))
    dec.decode(
      new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: Math.round(p.timestamp * 1e6), data: p.data }),
    );
  await dec.flush();
  dec.close();
  input.close();
  const comp = createCompositor(new OffscreenCanvas(W, H), new Map(), { preserve: true });
  const source = new FrameSource([{ id: 'src-a', kind: 'video', file: clip }]);
  const plan = framePlan(project, k);
  comp.paint(plan, await source.frames(plan));
  const painted = at(comp.readPixels());
  await source.close();
  comp.dispose();
  return { ok: true, width: W, height: H, exported, painted };
}

/**
 * The classic 24-patch colour chart (sRGB, 0–255; NFR-08 "colour on a 24-patch test chart"), six by four.
 */
const CHART_24: readonly Sample[] = [
  [115, 82, 68],
  [194, 150, 130],
  [98, 122, 157],
  [87, 108, 67],
  [133, 128, 177],
  [103, 189, 170],
  [214, 126, 44],
  [80, 91, 166],
  [193, 90, 99],
  [94, 60, 108],
  [157, 188, 64],
  [224, 163, 46],
  [56, 61, 150],
  [70, 148, 73],
  [175, 54, 60],
  [231, 199, 31],
  [187, 86, 149],
  [8, 133, 161],
  [243, 243, 242],
  [200, 200, 200],
  [160, 160, 160],
  [122, 122, 121],
  [85, 85, 85],
  [52, 52, 52],
];

/** F-007 test charts: `ramp`, the 256-step grey ramp as a 16 × 16 grid of patches (row by row, black first); `colours`, the 24-patch chart. */
export type GradeChart = 'ramp' | 'colours';

function chartPatches(chart: GradeChart): { cols: number; rows: number; patches: readonly Sample[] } {
  if (chart === 'colours') return { cols: 6, rows: 4, patches: CHART_24 };
  return { cols: 16, rows: 16, patches: Array.from({ length: 256 }, (_, i): Sample => [i, i, i]) };
}

/** A 1920 × 1080 chart photo (16:9) with flat patches. */
async function chartBitmap(chart: GradeChart): Promise<ImageBitmap> {
  const { cols, rows, patches } = chartPatches(chart);
  const W = 1920;
  const H = 1080;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  patches.forEach(([r, gr, b], i) => {
    const x0 = Math.round(((i % cols) * W) / cols);
    const x1 = Math.round((((i % cols) + 1) * W) / cols);
    const y0 = Math.round((Math.floor(i / cols) * H) / rows);
    const y1 = Math.round(((Math.floor(i / cols) + 1) * H) / rows);
    g.fillStyle = `rgb(${r},${gr},${b})`;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  });
  return createImageBitmap(c);
}

/** The bundled look tables (F-008), read through MOD-Assets as the app reads them (dev server: compiled-in paths). */
let tablesRead: Promise<Record<string, Uint8Array>> | null = null;
const lookTables = (): Promise<Record<string, Uint8Array>> =>
  (tablesRead ??= readLooks(decodeLookStrip).then((all) => Object.fromEntries(all.map((l) => [l.id, l.table]))));

/** A one-second project of one chart photo (Original aspect, so 16:9), with these adjustments and look. */
function chartProject(adjustments: Adjustments, seconds = 1, look: Look = null): Project {
  return {
    frame: { aspect: 'original', frameRate: 30, background: 'black' },
    sources: [{ id: 'src-c', kind: 'photo', name: 'chart', bytes: 1, width: 1920, height: 1080 }],
    clips: [
      {
        id: 'chart',
        sourceId: 'src-c',
        kind: 'photo',
        duration: Math.round(seconds * 1_000_000),
        placement: DEFAULT_PLACEMENT,
        adjustments,
        look,
        fadeIn: 0,
        fadeOut: 0,
        crossFadeNext: 0,
      },
    ],
    textLayers: [],
    audioClips: [],
  };
}

/**
 * Exports `project` (one chart photo) at `resolution` Balanced through the real export workers; frame `k`
 * decoded (RGBA), and the export worker's composed picture of frame `k` before encoding (its test hook).
 */
async function exportChartFrame(
  project: Project,
  chart: GradeChart,
  k: number,
  resolution: 480 | 1080 = 480,
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray; composed: Uint8Array | null } | null> {
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  let composed: Uint8Array | null = null;
  const handle = await start(
    project,
    { kind: 'video', resolution, quality: 'balanced' },
    {
      workers,
      scratch,
      caps: await caps(),
      media: [{ id: 'src-c', kind: 'photo', bitmap: await chartBitmap(chart) }],
      pcm: [],
      looks: await lookTables(),
      texts: () => ({}),
      phone: false,
      gains: new Map(),
      save: (blob) => {
        saved = blob;
        return URL.createObjectURL(blob);
      },
      tap: { frame: k, onFrame: (_w, _h, rgba) => (composed = rgba) },
    },
  );
  const result = await handle.result;
  await handle.cleaned;
  const blob = saved as Blob | null;
  if (!result.ok || !blob) return null;
  const input = await openInput(blob);
  const v = input.video!;
  const W = v.displayWidth;
  const H = v.displayHeight;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  let rgba: Uint8ClampedArray | null = null;
  const dec = new VideoDecoder({
    output: (f) => {
      if (Math.round((f.timestamp * 30) / 1e6) === k) {
        g.drawImage(f, 0, 0, W, H);
        rgba = g.getImageData(0, 0, W, H).data;
      }
      f.close();
    },
    error: () => undefined,
  });
  dec.configure(v.decoderConfig);
  for await (const p of input.packets('video'))
    dec.decode(
      new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: Math.round(p.timestamp * 1e6), data: p.data }),
    );
  await dec.flush();
  dec.close();
  input.close();
  return rgba ? { width: W, height: H, rgba, composed } : null;
}

/** The compositor's paint of the chart project's frame `k` at W × H (what the preview shows, INV-02). */
async function paintChart(
  project: Project,
  chart: GradeChart,
  W: number,
  H: number,
  ks: readonly number[],
  compositor?: ReturnType<typeof createCompositor>,
): Promise<Uint8Array[]> {
  const comp =
    compositor ??
    createCompositor(new OffscreenCanvas(W, H), new Map(Object.entries(await lookTables())), { preserve: true });
  const bitmap = await chartBitmap(chart);
  const source = new FrameSource([{ id: 'src-c', kind: 'photo', bitmap }]);
  const out: Uint8Array[] = [];
  for (const k of ks) {
    const plan = framePlan(project, k);
    comp.paint(plan, await source.frames(plan));
    out.push(comp.readPixels().slice());
  }
  await source.close();
  comp.dispose();
  return out;
}

/** F-007.AC2 / AC6 / NFR-08: the chart's patch centres in the exported video, in the paint, and as made. */
export interface GradeExportReport {
  readonly ok: boolean;
  readonly width: number;
  readonly height: number;
  readonly input: readonly Sample[];
  readonly exported: Sample[];
  readonly painted: Sample[];
}

/**
 * F-007.AC2, AC6 and F-008.AC6 (export halves), INV-02, NFR-08: a chart photo with `adjustments` and `look`
 * (the bundled tables, read through MOD-Assets), exported at 480p
 * Balanced through the real export workers; frame 15 of the file is decoded and each patch's centre
 * (mean of a 5 × 5 block) read, next to the compositor's paint of the same frame and size (the
 * preview's picture) and the chart's own values.
 */
async function gradeExport(adjustments: Adjustments, chart: GradeChart, look: Look = null): Promise<GradeExportReport> {
  const project = chartProject(adjustments, 1, look);
  const k = 15;
  const file = await exportChartFrame(project, chart, k);
  const { cols, rows, patches } = chartPatches(chart);
  if (!file) return { ok: false, width: 0, height: 0, input: patches, exported: [], painted: [] };
  const { width: W, height: H, rgba } = file;
  const [paint] = await paintChart(project, chart, W, H, [k]);
  // Both read top-down (`Compositor.readPixels` flips GL's rows).
  const centre = (px: ArrayLike<number>, i: number): Sample => {
    const cx = Math.floor((((i % cols) + 0.5) * W) / cols);
    const cy = Math.floor(((Math.floor(i / cols) + 0.5) * H) / rows);
    const sum = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const o = ((cy + dy) * W + cx + dx) * 4;
        for (let c = 0; c < 3; c++) sum[c]! += px[o + c]!;
      }
    return [sum[0]! / 25, sum[1]! / 25, sum[2]! / 25];
  };
  return {
    ok: true,
    width: W,
    height: H,
    input: patches,
    exported: patches.map((_, i) => centre(rgba, i)),
    painted: patches.map((_, i) => centre(paint!, i)),
  };
}

/** F-007.AC8: grain repeatability between two paints, a second compositor and the export, at one size. */
export interface GrainReport {
  readonly ok: boolean;
  /** The same frame painted twice by one compositor (shown twice in the preview): identical bytes. */
  readonly sameTwice: boolean;
  /** The same frame painted by a second compositor at the same size (the export's own): identical bytes. */
  readonly sameElsewhere: boolean;
  /** The next frame differs (grain changes per frame). */
  readonly nextDiffers: boolean;
  /**
   * The export worker's own composed picture of frame k, before encoding (its `tapFrame` hook), is
   * byte-identical to the preview's paint at the same size.
   */
  readonly workerSame: boolean;
  /**
   * Correlation of the export's grain (the decoded frame minus the grain-free paint) with frame k's grain,
   * and with frame k + 1's (other grain). Lossy coding softens grain, so the bytes can't match; the
   * pattern does.
   */
  readonly corrSame: number;
  readonly corrOther: number;
}

/**
 * F-007.AC8: the 24-patch chart with Grain 50. Frame k is painted twice by one compositor with another
 * frame between (the preview showing it twice), and once by a second compositor at the export's size
 * (as the export worker's is); the export worker's own composed frame k (before encoding) is compared byte
 * for byte, and the encoded file is decoded at the same resolution to show it carries that grain pattern.
 */
async function grainParity(grain = 50): Promise<GrainReport> {
  const project = chartProject({ grain }, 0.6);
  const k = 15;
  const file = await exportChartFrame(project, 'colours', k, 1080);
  if (!file)
    return {
      ok: false,
      sameTwice: false,
      sameElsewhere: false,
      nextDiffers: false,
      workerSame: false,
      corrSame: 0,
      corrOther: 0,
    };
  const { width: W, height: H, rgba, composed } = file;
  const [a, next, b] = await paintChart(project, 'colours', W, H, [k, k + 1, k]);
  const [c] = await paintChart(project, 'colours', W, H, [k]);
  const [clean] = await paintChart(chartProject({}, 0.6), 'colours', W, H, [k]);
  const equal = (x: Uint8Array, y: Uint8Array): boolean => x.length === y.length && x.every((v, i) => v === y[i]);
  /** Pearson correlation of (x − clean) and (y − clean) over the green channel. */
  const corr = (x: ArrayLike<number>, y: ArrayLike<number>): number => {
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let n = 0;
    for (let i = 1; i < x.length; i += 4) {
      const u = x[i]! - clean![i]!;
      const v = y[i]! - clean![i]!;
      sx += u;
      sy += v;
      sxx += u * u;
      syy += v * v;
      sxy += u * v;
      n++;
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    return cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
  };
  return {
    ok: true,
    sameTwice: equal(a!, b!),
    sameElsewhere: equal(a!, c!),
    nextDiffers: !equal(a!, next!),
    workerSame: composed !== null && equal(composed, a!),
    corrSame: corr(rgba, a!),
    corrOther: corr(rgba, next!),
  };
}

/** A photo-like test picture: sky, sun, a skin-tone patch, foliage, water and a grey ramp (1920 × 1080). */
async function photoLike(): Promise<ImageBitmap> {
  const W = 1920;
  const H = 1080;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, 'rgb(246,161,94)');
  sky.addColorStop(0.45, 'rgb(229,115,95)');
  sky.addColorStop(0.75, 'rgb(123,74,124)');
  sky.addColorStop(1, 'rgb(43,58,99)');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgb(255,227,163)';
  g.beginPath();
  g.arc(W * 0.28, H * 0.36, H * 0.11, 0, Math.PI * 2);
  g.fill();
  // Skin tones, light to dark.
  [
    [241, 194, 167],
    [224, 172, 138],
    [198, 134, 103],
    [141, 85, 62],
  ].forEach(([r, gr, b], i) => {
    g.fillStyle = `rgb(${r},${gr},${b})`;
    g.fillRect(W * (0.55 + i * 0.1), H * 0.18, W * 0.09, H * 0.3);
  });
  const leaves = g.createLinearGradient(0, H * 0.55, W, H * 0.55);
  leaves.addColorStop(0, 'rgb(46,92,40)');
  leaves.addColorStop(1, 'rgb(140,190,80)');
  g.fillStyle = leaves;
  g.fillRect(0, H * 0.55, W, H * 0.17);
  const water = g.createLinearGradient(0, H * 0.72, 0, H * 0.88);
  water.addColorStop(0, 'rgb(34,48,77)');
  water.addColorStop(1, 'rgb(15,23,38)');
  g.fillStyle = water;
  g.fillRect(0, H * 0.72, W, H * 0.16);
  const ramp = g.createLinearGradient(0, 0, W, 0);
  ramp.addColorStop(0, 'black');
  ramp.addColorStop(1, 'white');
  g.fillStyle = ramp;
  g.fillRect(0, H * 0.88, W, H * 0.12);
  return createImageBitmap(c);
}

/** F-009: one main-track clip of a fade export (times in seconds). */
export interface FadeClipSpec {
  /** The photo's flat colour (the picture run). */
  readonly colour: Sample;
  /** The tone of the clip's sound (the sound run), Hz, at amplitude 0.25. */
  readonly freq: number;
  readonly seconds: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  /** The cross-fade into the next clip. */
  readonly crossFade?: number;
}

export interface FadeSpec {
  readonly clips: readonly FadeClipSpec[];
  /** An audio clip with its own tone (amplitude 0.25) on the audio track (sound run only). */
  readonly audio?: {
    readonly freq: number;
    readonly start: number;
    readonly seconds: number;
    readonly fadeIn?: number;
    readonly fadeOut?: number;
  };
  /** Frames whose centre is read in the exported file and in the compositor's paint. */
  readonly frames: readonly number[];
  /** Tones measured in the decoded export: each frequency's amplitude over 50 ms centred at `at` seconds. */
  readonly windows: readonly { readonly at: number; readonly freq: number }[];
  /** The background (RULE-04), black by default. */
  readonly background?: Frame['background'];
}

export interface FadeReport {
  readonly ok: boolean;
  /** Length (s) of the exported file's picture (its duration) and of its sound track (its packets' end). */
  readonly pictureSeconds: number;
  readonly soundSeconds: number;
  /** Centre of each frame (mean of 5 × 5): the exported file decoded, and the compositor's paint (the preview). */
  readonly exported: Sample[];
  readonly painted: Sample[];
  /** Each window's tone amplitude in the decoded export (linear; a full tone reads about 0.25). */
  readonly heard: number[];
}

const SR = 48_000;

/** A tone's amplitude over [a, b) samples of L and R (one bin of the DFT; whole cycles keep it exact). */
export function toneAmplitude(L: Float32Array, R: Float32Array, a: number, b: number, freq: number): number {
  let re = 0;
  let im = 0;
  for (let i = Math.max(0, a); i < Math.min(b, L.length); i++) {
    const x = (L[i]! + R[i]!) / 2;
    const w = (2 * Math.PI * freq * i) / SR;
    re += x * Math.cos(w);
    im -= x * Math.sin(w);
  }
  return (2 * Math.hypot(re, im)) / Math.max(1, b - a);
}

function tonePcm(sourceId: string, freq: number, seconds: number): PcmSource {
  const n = Math.ceil(seconds * SR);
  const L = Float32Array.from({ length: n }, (_, i) => 0.25 * Math.sin((2 * Math.PI * freq * i) / SR));
  return { sourceId, L, R: L.slice() };
}

async function flatBitmap([r, g, b]: Sample): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(320, 180);
  const x = c.getContext('2d')!;
  x.fillStyle = `rgb(${r},${g},${b})`;
  x.fillRect(0, 0, 320, 180);
  return createImageBitmap(c);
}

/** Exports `project` with `ctx` parts and returns the saved file, or null when the export failed. */
async function exportFile(
  project: Project,
  settings: ExportSettings,
  parts: Pick<ExportContext, 'media' | 'pcm'>,
  texts: ExportContext['texts'] = () => ({}),
): Promise<Blob | null> {
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const handle = await start(project, settings, {
    workers,
    scratch,
    caps: await caps(),
    ...parts,
    looks: {},
    texts,
    phone: false,
    gains: new Map(),
    save: (blob) => {
      saved = blob;
      return URL.createObjectURL(blob);
    },
  });
  const result = await handle.result;
  await handle.cleaned;
  return result.ok ? (saved as Blob | null) : null;
}

/** Frames `ks` of an exported file, decoded to RGBA at its size. */
async function decodeFrames(
  blob: Blob,
  ks: readonly number[],
  rate: number,
): Promise<{ W: number; H: number; px: Map<number, Uint8ClampedArray> }> {
  const input = await openInput(blob);
  const v = input.video!;
  const W = v.displayWidth;
  const H = v.displayHeight;
  const g = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })!;
  const px = new Map<number, Uint8ClampedArray>();
  const dec = new VideoDecoder({
    output: (f) => {
      const k = Math.round((f.timestamp * rate) / 1e6);
      if (ks.includes(k)) {
        g.drawImage(f, 0, 0, W, H);
        px.set(k, g.getImageData(0, 0, W, H).data);
      }
      f.close();
    },
    error: () => undefined,
  });
  dec.configure(v.decoderConfig);
  for await (const p of input.packets('video'))
    dec.decode(
      new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: Math.round(p.timestamp * 1e6), data: p.data }),
    );
  await dec.flush();
  dec.close();
  input.close();
  return { W, H, px };
}

/**
 * F-009.AC1/AC2/AC4/AC7 (export halves), INV-02, NFR-08: the clips as flat photos with their fades and
 * cross-fades, exported at 480p Balanced through the real export workers — frame `k`'s centre decoded from
 * the file next to the compositor's paint of the same frame (the preview's picture); and the same timing
 * as video clips (and an audio clip) each sounding its own tone, exported with sound, the file's sound
 * decoded and each tone's amplitude measured over 50 ms windows (MOD-Plan's fades and equal-power
 * cross-fades, mixed by MOD-Audio as the preview mixes them).
 */
async function fadeExport(spec: FadeSpec): Promise<FadeReport> {
  const us = (s = 0): number => Math.round(s * 1e6);
  const frame: Frame = { aspect: '16:9', frameRate: 30, background: spec.background ?? 'black' };
  const timing = (c: FadeClipSpec) => ({
    placement: DEFAULT_PLACEMENT,
    adjustments: {},
    look: null,
    fadeIn: us(c.fadeIn),
    fadeOut: us(c.fadeOut),
    crossFadeNext: us(c.crossFade),
  });
  // The picture: flat photos.
  const pictures: Project = {
    frame,
    sources: spec.clips.map((_, i) => ({
      id: `src-p${i}`,
      kind: 'photo',
      name: `p${i}`,
      bytes: 1,
      width: 320,
      height: 180,
    })),
    clips: spec.clips.map((c, i) => ({
      id: `p${i}`,
      sourceId: `src-p${i}`,
      kind: 'photo',
      duration: us(c.seconds),
      ...timing(c),
    })),
    textLayers: [],
    audioClips: [],
  };
  const photos = await Promise.all(spec.clips.map((c) => flatBitmap(c.colour)));
  const media: EngineMedia[] = photos.map((bitmap, i) => ({ id: `src-p${i}`, kind: 'photo', bitmap }));
  const video = await exportFile(pictures, { kind: 'video', resolution: 480, quality: 'balanced' }, { media, pcm: [] });
  const empty = { ok: false, pictureSeconds: 0, soundSeconds: 0, exported: [], painted: [], heard: [] };
  if (!video) return empty;
  const { W, H, px } = await decodeFrames(video, spec.frames, 30);
  const centre = (p: ArrayLike<number> | undefined): Sample => {
    if (!p) return [Number.NaN, Number.NaN, Number.NaN];
    const sum = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const o = ((Math.floor(H / 2) + dy) * W + Math.floor(W / 2) + dx) * 4;
        for (let c = 0; c < 3; c++) sum[c]! += p[o + c]!;
      }
    return [sum[0]! / 25, sum[1]! / 25, sum[2]! / 25];
  };
  const comp = createCompositor(new OffscreenCanvas(W, H), new Map(), { preserve: true });
  const source = new FrameSource(media);
  const painted: Sample[] = [];
  for (const k of spec.frames) {
    const plan = framePlan(pictures, k);
    comp.paint(plan, await source.frames(plan));
    painted.push(centre(comp.readPixels()));
  }
  await source.close();
  comp.dispose();
  const input = await openInput(video);
  const pictureSeconds = input.duration;
  input.close();

  // The sound: the same timing as video clips with tones (and an audio clip).
  const longest = Math.max(...spec.clips.map((c) => c.seconds), spec.audio?.seconds ?? 0);
  const file = await makeClip({ rate: 30, frames: Math.ceil(longest * 30) + 1, gop: 30 });
  const a = spec.audio;
  const sounds: Project = {
    frame,
    sources: [
      ...spec.clips.map((_, i) => ({
        id: `src-v${i}`,
        kind: 'video' as const,
        name: `v${i}`,
        bytes: 1,
        duration: us(longest),
        width: CLIP_W,
        height: CLIP_H,
        frameRate: 30,
        hasSound: true,
      })),
      ...(a
        ? [{ id: 'src-m', kind: 'audio' as const, name: 'm', bytes: 1, duration: us(a.seconds), hasSound: true }]
        : []),
    ],
    clips: spec.clips.map((c, i) => ({
      id: `v${i}`,
      sourceId: `src-v${i}`,
      kind: 'video',
      in: 0,
      out: us(c.seconds),
      speedPct: 100,
      volume: 100,
      muted: false,
      ...timing(c),
    })),
    textLayers: [],
    audioClips: a
      ? [
          {
            id: 'm',
            sourceId: 'src-m',
            start: us(a.start),
            in: 0,
            out: us(a.seconds),
            volume: 100,
            muted: false,
            fadeIn: us(a.fadeIn),
            fadeOut: us(a.fadeOut),
          },
        ]
      : [],
  };
  const sound = await exportFile(
    sounds,
    { kind: 'video', resolution: 480, quality: 'balanced' },
    {
      media: spec.clips.map((_, i) => ({ id: `src-v${i}`, kind: 'video' as const, file })),
      pcm: [
        ...spec.clips.map((c, i) => tonePcm(`src-v${i}`, c.freq, longest + 1)),
        ...(a ? [tonePcm('src-m', a.freq, a.seconds + 1)] : []),
      ],
    },
  );
  if (!sound) return { ...empty, pictureSeconds };
  const seconds = Math.max(...layoutOf(sounds).spans.map((s) => s.endFrame)) / 30;
  const [L, R] = await decodeWindow(sound, 0, seconds);
  // The file's sound track as written: the end of its last packet (not the window decoded above).
  const read = await openInput(sound);
  let soundSeconds = 0;
  for await (const p of read.packets('audio')) soundSeconds = Math.max(soundSeconds, p.timestamp + p.duration);
  soundSeconds -= read.audio?.firstTimestamp ?? 0;
  read.close();
  const half = Math.round(0.025 * SR);
  const heard = spec.windows.map((w) => {
    const c = Math.round(w.at * SR);
    return toneAmplitude(L, R, c - half, c + half, w.freq);
  });
  return {
    ok: true,
    pictureSeconds,
    soundSeconds,
    exported: spec.frames.map((k) => centre(px.get(k))),
    painted,
    heard,
  };
}

/**
 * F-008 look sign-off (an owner check): a contact sheet of the 16 bundled looks at 100 — each cell the
 * 24-patch chart above the photo-like picture, painted by the real compositor with the real tables — plus
 * the originals, appended to the page as one canvas (`#look-sheet`) for a screenshot. Returns its size.
 */
async function lookContactSheet(
  names: Readonly<Record<string, string>>,
): Promise<{ width: number; height: number; looks: number }> {
  const tables = await lookTables();
  const ids = Object.keys(tables);
  const cellW = 384;
  const cellH = 216;
  const label = 28;
  const cols = 4;
  const cells: (string | null)[] = [null, ...ids];
  const rows = Math.ceil(cells.length / cols);
  const sheet = document.createElement('canvas');
  sheet.id = 'look-sheet';
  sheet.width = cols * cellW;
  sheet.height = rows * (2 * cellH + label);
  const out = sheet.getContext('2d')!;
  out.fillStyle = '#0b0812';
  out.fillRect(0, 0, sheet.width, sheet.height);
  const comp = createCompositor(new OffscreenCanvas(cellW, cellH), new Map(Object.entries(tables)), {
    preserve: true,
  });
  const pictures = [await chartBitmap('colours'), await photoLike()];
  for (const [i, id] of cells.entries()) {
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * (2 * cellH + label);
    const project = chartProject({}, 1, id ? { id, intensity: 100 } : null);
    for (const [j, bitmap] of pictures.entries()) {
      const source = new FrameSource([{ id: 'src-c', kind: 'photo', bitmap }]);
      const plan = framePlan(project, 0);
      comp.paint(plan, await source.frames(plan));
      const px = comp.readPixels();
      out.putImageData(new ImageData(new Uint8ClampedArray(px), cellW, cellH), x, y + label + j * cellH);
    }
    out.fillStyle = '#efeaf8';
    out.font = '600 16px sans-serif';
    out.fillText(id ? `${names[id] ?? id} (${id})` : 'Original (no look)', x + 8, y + 20);
  }
  comp.dispose();
  document.body.append(sheet);
  return { width: sheet.width, height: sheet.height, looks: ids.length };
}

/** F-010.AC5: text lines drawn once per typeface, one second each. */
export interface TextExportSpec {
  readonly lines: readonly string[];
}

export interface TextFaceReport {
  readonly typeface: string;
  /** The bundled face is loaded for the text (`document.fonts.check`). */
  readonly loaded: boolean;
  /** The rasterised text differs from the same text in a generic fallback face (the bundled face drew it). */
  readonly differsFromFallback: boolean;
  /** "ệ" has ink where "e" has none: the tone marks are drawn. */
  readonly marksDrawn: boolean;
  /** Pixels of text ink (differing from the grey background by more than 60) in the decoded export / the paint. */
  readonly inkExport: number;
  readonly inkPaint: number;
  /** Mean absolute difference (0–255) between the decoded export and the paint over the text's band. */
  readonly meanDiff: number;
  /** Ink of the same frame painted with the bitmaps the preview makes (rasterised at a preview canvas's size). */
  readonly inkPreview: number;
  /** Largest move (px) of the text's ink box (left, top, right, bottom) between those two paints. */
  readonly boxShift: number;
  /**
   * Characters of the text this face does not draw itself (a fallback face would): measured in the face with two
   * different generic fallbacks, a character the face covers measures the same.
   */
  readonly fallbackGlyphs: readonly string[];
}

export interface TextExportReport {
  readonly ok: boolean;
  readonly reason?: string;
  readonly faces: readonly TextFaceReport[];
}

const TEXT_GREY: Sample = [90, 90, 90];
const graphemesOf = (s: string): string[] =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.normalize('NFC')), (x) => x.segment);

/** Ink pixels of an RGBA image: channels away from the grey background by more than 60. */
function inkOf(px: ArrayLike<number>, n: number): number {
  let ink = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (
      Math.abs(px[o]! - TEXT_GREY[0]) > 60 ||
      Math.abs(px[o + 1]! - TEXT_GREY[1]) > 60 ||
      Math.abs(px[o + 2]! - TEXT_GREY[2]) > 60
    )
      ink++;
  }
  return ink;
}

/** The box (left, top, right, bottom) of the ink pixels of an RGBA image. */
function inkBox(px: ArrayLike<number>, W: number, H: number): [number, number, number, number] {
  let l = W;
  let t = H;
  let r = -1;
  let b = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (Math.max(...[0, 1, 2].map((c) => Math.abs(px[o + c]! - TEXT_GREY[c]!))) <= 60) continue;
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
  return [l, t, r, b];
}

/** Pixels of a bitmap as RGBA. */
function bitmapPixels(b: ImageBitmap): Uint8ClampedArray {
  const c = new OffscreenCanvas(b.width, b.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(b, 0, 0);
  return g.getImageData(0, 0, b.width, b.height).data;
}

/**
 * F-010.AC5 / F-010.R5 / INV-02: the text in each RULE-11 typeface (white with the default outline, on a flat
 * grey photo) rasterised by MOD-Preview's rasteriser at the output size, exported at 480p Balanced through the
 * real export workers, one second per face; the middle frame of each second decoded next to the compositor's
 * paint of the same frame with the same bitmaps (the preview's picture). Also checks the bundled faces: each is
 * loaded, draws differently from a generic fallback, and draws Vietnamese tone marks.
 */
async function textExport(spec: TextExportSpec): Promise<TextExportReport> {
  await loadFonts();
  const faces = ['sans', 'display', 'serif', 'rounded'] as const;
  const us = (s: number): number => Math.round(s * 1e6);
  const content = spec.lines.join('\n');
  const base = {
    content,
    size: 5,
    colour: 'white',
    style: 'outline',
    align: 'centre',
    x: 0.5,
    y: 0.5,
    fade: false,
  } as const;
  const project: Project = {
    frame: { aspect: '16:9', frameRate: 30, background: 'black' },
    sources: [{ id: 'src-g', kind: 'photo', name: 'g', bytes: 1, width: 320, height: 180 }],
    clips: [
      {
        id: 'g',
        sourceId: 'src-g',
        kind: 'photo',
        duration: us(faces.length),
        placement: DEFAULT_PLACEMENT,
        adjustments: {},
        look: null,
        fadeIn: 0,
        fadeOut: 0,
        crossFadeNext: 0,
      },
    ],
    textLayers: faces.map((typeface, i) => ({ ...base, id: `t-${typeface}`, typeface, start: us(i), end: us(i + 1) })),
    audioClips: [],
  };
  const media: EngineMedia[] = [{ id: 'src-g', kind: 'photo', bitmap: await flatBitmap(TEXT_GREY) }];
  const settings = { kind: 'video', resolution: 480, quality: 'balanced' } as const;
  // The output size of the 480p export (RULE-15): the bitmaps are made for it, as the export asks.
  const { width: W, height: H } = videoOutputSize(frameAspect(project), 480);
  const texts = await textBitmaps(project.textLayers, W, H);
  // The preview's own bitmaps: a 16:9 preview canvas (640 × 360), scaled by the compositor as the preview is.
  const previewTexts = await textBitmaps(project.textLayers, 640, 360);
  const video = await exportFile(project, settings, { media, pcm: [] }, () => texts);
  if (!video) return { ok: false, reason: 'export failed', faces: [] };
  const ks = faces.map((_, i) => i * 30 + 15);
  const decoded = await decodeFrames(video, ks, 30);
  if (decoded.W !== W || decoded.H !== H) return { ok: false, reason: `size ${decoded.W}×${decoded.H}`, faces: [] };
  const comp = createCompositor(new OffscreenCanvas(W, H), new Map(), { preserve: true });
  const source = new FrameSource(media);
  const out: TextFaceReport[] = [];
  for (const [i, typeface] of faces.entries()) {
    const k = ks[i]!;
    const plan = framePlan(project, k);
    comp.paint(plan, await source.frames(plan), new Map(Object.entries(texts)));
    const painted = comp.readPixels();
    comp.paint(plan, await source.frames(plan), new Map(Object.entries(previewTexts)));
    const previewPixels = comp.readPixels();
    const inkPreview = inkOf(previewPixels, W * H);
    const boxPreview = inkBox(previewPixels, W, H);
    const exported = decoded.px.get(k)!;
    let diff = 0;
    let n = 0;
    // The text's band: the middle third of the frame's height.
    for (let y = Math.floor(H / 3); y < Math.floor((2 * H) / 3); y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) diff += Math.abs(exported[o + c]! - painted[o + c]!);
        n += 3;
      }
    // The bundled face against a generic fallback, and "ệ" against "e", rasterised the same way.
    const layer = project.textLayers[i]!;
    const face = TEXT_FACES[typeface];
    const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
    const widthIn = (ch: string, fallback: string): number => {
      probe.font = `${face.weight} 40px "${face.family}", ${fallback}`;
      return probe.measureText(ch).width;
    };
    const fallbackGlyphs = [...new Set(graphemesOf(content.replace(/\s/g, '')))].filter(
      (ch) => Math.abs(widthIn(ch, 'monospace') - widthIn(ch, 'serif')) > 0.01,
    );
    const loaded = document.fonts.check(`${face.weight} 32px "${face.family}"`, content);
    const own = await rasteriseText({ ...layer, content: 'Chúc mừng' }, W, H);
    const plain = await rasteriseText({ ...layer, content: 'e', style: 'plain', size: 20 }, W, H);
    const marked = await rasteriseText({ ...layer, content: 'ệ', style: 'plain', size: 20 }, W, H);
    const fallbackCanvas = new OffscreenCanvas(own?.width ?? 1, own?.height ?? 1);
    const fg = fallbackCanvas.getContext('2d')!;
    fg.font = `${face.weight} ${(layer.size / 100) * H}px monospace`;
    fg.textBaseline = 'middle';
    fg.fillStyle = '#fff';
    fg.fillText('Chúc mừng', 0, fallbackCanvas.height / 2);
    const fallback = fallbackCanvas.transferToImageBitmap();
    const a = own ? bitmapPixels(own) : new Uint8ClampedArray();
    const fb = bitmapPixels(fallback);
    let differs = a.length !== fb.length;
    for (let j = 3; !differs && j < a.length; j += 4) if (a[j]! > 128 !== fb[j]! > 128) differs = true;
    // Ink rows of "e" and "ệ": the marks add rows above and below the letter.
    const rows = (b: ImageBitmap | null): number => {
      if (!b) return 0;
      const px = bitmapPixels(b);
      let r = 0;
      for (let y = 0; y < b.height; y++) {
        let any = false;
        for (let x = 0; x < b.width && !any; x++) any = px[(y * b.width + x) * 4 + 3]! > 128;
        if (any) r++;
      }
      return r;
    };
    out.push({
      typeface,
      loaded,
      differsFromFallback: differs,
      marksDrawn: rows(marked) > rows(plain) * 1.2,
      inkExport: inkOf(exported, W * H),
      inkPaint: inkOf(painted, W * H),
      inkPreview,
      boxShift: Math.max(...boxPreview.map((v, j) => Math.abs(v - inkBox(painted, W, H)[j]!))),
      fallbackGlyphs,
      meanDiff: diff / n,
    });
    for (const b of [own, plain, marked, fallback]) b?.close();
  }
  await source.close();
  comp.dispose();
  for (const t of [...Object.values(texts), ...Object.values(previewTexts)]) t.bitmap.close();
  return { ok: true, faces: out };
}

export const exportHarness = {
  textExport,
  lookContactSheet,
  fadeExport,
  caps,
  run,
  runTone,
  runMix,
  frameFill,
  gradeExport,
  grainParity,
  /** The last export's file as bytes (Playwright saves it for manual checks). */
  async lastFile(): Promise<number[]> {
    return lastBlob ? Array.from(new Uint8Array(await lastBlob.arrayBuffer()).subarray(0, 16)) : [];
  },
  scratchNames: () => scratch.names(),
  pending: () => [...scratch.pending],
  /**
   * ADR-0010 outcome item 1: the real writer receives every video packet before any sound; the mux
   * schedule spills the video, then streams both tracks in time order — the sink has received nearly
   * the whole file before the index is written, and no video was held in memory meanwhile.
   */
  async lateAudio(): Promise<{
    spilled: number;
    videoBytes: number;
    audioBytes: number;
    writtenBeforeSound: number;
    writtenBeforeFinalize: number;
    mediaBytesBeforeLastSecond: number;
    total: number;
    heldMax: number;
    maxPacket: number;
    read: { video: number; audio: number; videoEnd: number; audioFirst: number; audioEnd: number };
  }> {
    const frames = 90;
    const { video, audio, aconfig } = await encodedParts(frames, 3);
    const parts: { at: number; data: Uint8Array }[] = [];
    let written = 0;
    const sink = {
      write: (data: Uint8Array, at: number) => {
        parts.push({ at, data: data.slice() });
        written += data.length;
      },
      close: () => undefined,
    };
    const writer = await createOutput('mp4', sink, { video: { codec: 'avc', frameRate: 30 }, audio: { codec: 'aac' } });
    const spill = new MemorySpill();
    const mux = new LateAudioMux(writer, true, () => spill);
    for (const v of video) await mux.video(v.p, v.config);
    const writtenBeforeSound = written;
    await mux.audioReady(audio, aconfig);
    await mux.finish();
    const writtenBeforeFinalize = written;
    await writer.finalize();
    const size = Math.max(...parts.map((p) => p.at + p.data.length));
    const file = new Uint8Array(size);
    for (const p of parts) file.set(p.data, p.at);
    const input = await openInput(new Blob([file]));
    let nv = 0;
    let videoEnd = 0;
    let na = 0;
    let audioEnd = 0;
    for await (const p of input.packets('video')) {
      nv++;
      videoEnd = Math.max(videoEnd, p.timestamp + p.duration);
    }
    for await (const p of input.packets('audio')) {
      na++;
      audioEnd = Math.max(audioEnd, p.timestamp + p.duration);
    }
    const audioFirst = input.audio?.firstTimestamp ?? NaN;
    input.close();
    return {
      spilled: mux.spilledBytes,
      videoBytes: video.reduce((s, v) => s + v.p.data.length, 0),
      audioBytes: audio.reduce((s, p) => s + p.data.length, 0),
      writtenBeforeSound,
      writtenBeforeFinalize,
      mediaBytesBeforeLastSecond:
        video.filter((v) => v.p.timestamp < 2).reduce((s, v) => s + v.p.data.length, 0) +
        audio.filter((p) => p.timestamp < 2).reduce((s, p) => s + p.data.length, 0),
      total: size,
      heldMax: mux.heldVideoBytesMax,
      maxPacket: Math.max(...video.map((v) => v.p.data.length)),
      read: { video: nv, audio: na, videoEnd, audioFirst, audioEnd },
    };
  },
  /**
   * F-015.AC14: files of a closed page (its lock is free) are swept; a live tab's (its lock held) and
   * names that are not ours are kept.
   */
  async sweep(): Promise<{ deleted: string[]; kept: string[]; supported: boolean }> {
    const { storage, locks } = browserStorage();
    if (!storage || !locks) return { deleted: [], kept: [], supported: false };
    const dir = await (await storage.getDirectory()).getDirectoryHandle(SCRATCH_DIR, { create: true });
    for (const name of ['export-deadsess1-aaa.part', 'export-deadsess1-bbb.part', 'export-livesess2-ccc.part'])
      await dir.getFileHandle(name, { create: true });
    // Another tab alive: its session lock is held (never released here).
    await new Promise<void>((granted) => {
      void navigator.locks.request(lockName('livesess2'), () => {
        granted();
        return new Promise(() => undefined);
      });
    });
    const log = await scratch.sweep();
    const kept = await scratch.names();
    return { deleted: log.deleted, kept, supported: true };
  },
  /** Whether this context has an origin-private file system with sync handles. */
  async opfs(): Promise<boolean> {
    try {
      const { storage } = browserStorage();
      if (!storage) return false;
      await (await storage.getDirectory()).getDirectoryHandle(SCRATCH_DIR, { create: true });
      return true;
    } catch {
      return false;
    }
  },
  projectFrames: (frames: number) => projectFrames(codedProject({ rate: 30, frames, gop: 30 })),
};
