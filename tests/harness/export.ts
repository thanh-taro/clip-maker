// Export harness (test-only; tests/e2e/export-*.spec.ts): MOD-Export and MOD-Scratch in real engines.
// A frame-coded clip is made in the page (tests/harness/video.ts) and its sound is generated, so nothing
// is added to git. Exports run through MOD-Export's main-thread side and its two real workers; results
// are read back with MOD-Container and compared with the compositor's paint (the preview's picture).
import { TruePeakMeter } from '../../src/audio';
import {
  chooseAudioFormat,
  chooseVideoFormat,
  probeCapabilities,
  trialAudioEncode,
  trialVideoEncode,
  videoEncoderConfig,
  withNormalisedDescription,
} from '../../src/codec';
import { createCompositor } from '../../src/compositor';
import { createOutput, openInput, type OutPacket } from '../../src/container';
import { frameStart, projectFrames, type ExportSettings, type PcmSource, type Project } from '../../src/core';
import {
  ExportWorkers,
  LateAudioMux,
  MemorySpill,
  start,
  type ExportCaps,
  type ExportContext,
  type ExportResult,
} from '../../src/export';
import { FrameSource } from '../../src/export/pipeline';
import { framePlan } from '../../src/plan';
import { browserScratchEnv, browserStorage, lockName, Scratch, SCRATCH_DIR } from '../../src/scratch';
import { de00, lab, type Rgb } from '../support/colour';
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
}

export interface FrameCheck {
  readonly k: number;
  readonly code: number;
  readonly deMean: number;
  readonly deMax: number;
}

export interface RunReport {
  readonly result: ExportResult | { ok: false; error: string };
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
  const project: Project = codedProject({ rate: 30, frames: o.frames, gop: 30 });
  const seconds = o.frames / 30;
  workers ??= new ExportWorkers();
  let saved: Blob | null = null;
  const ctx: ExportContext = {
    workers,
    scratch: o.scratch === false ? new Scratch({ ...browserScratchEnv(), storage: null }) : scratch,
    caps: await caps(),
    media: [{ id: 'src-a', kind: 'video', file: clip }],
    pcm: o.sound ? [loudPcm(seconds + 1)] : [],
    looks: {},
    texts: () => ({}),
    phone: false,
    gains: new Map(),
    save: (blob) => {
      saved = blob;
      return URL.createObjectURL(blob);
    },
  };
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
    ms,
    cancelMs,
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

export const exportHarness = {
  caps,
  run,
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
