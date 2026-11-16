/// <reference types="vite/client" />
// Video harness (test-only; tests/e2e/engine-*.spec.ts, compositor.spec.ts): MOD-Compositor, MOD-Engine
// and MOD-Preview in real engines. Clips are made here with the browser's own encoder and the container
// library's writer (ADR-0016 §4: "the fixtures page/worker that makes the chart and clap fixtures with
// our own encoder"), so nothing large is added to git: each frame carries its index as 10 black/white
// blocks across the top half and a hue below.
import { signal } from '@preact/signals';
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { Playback, startAudioWorker, WORKLET_URL } from '../../src/audio';
import { createCompositor, effectsCheck, type Compositor } from '../../src/compositor';
import {
  DEFAULT_PLACEMENT,
  frameStart,
  type Adjustments,
  type Clip,
  type FromEngine,
  type Look,
  type Project,
} from '../../src/core';
import { BUDGETS, Engine, startEngineWorker, type EngineDeps, type EngineFrame } from '../../src/engine';
import { openVideoSource } from '../../src/engine/video';
import { framePlan } from '../../src/plan';
import { mountPreview, type PreviewController } from '../../src/preview';

export const CLIP_W = 320;
export const CLIP_H = 240;
export const BITS = 10;

export interface ClipSpec {
  readonly rate: number;
  readonly frames: number;
  /** Keyframe every `gop` frames. */
  readonly gop: number;
}

function drawCoded(g: OffscreenCanvasRenderingContext2D, k: number): void {
  g.fillStyle = `hsl(${(k * 37) % 360} 70% 45%)`;
  g.fillRect(0, 0, CLIP_W, CLIP_H);
  const bw = CLIP_W / BITS;
  for (let b = 0; b < BITS; b++) {
    g.fillStyle = (k >> b) & 1 ? '#ffffff' : '#000000';
    g.fillRect(b * bw, 0, bw, CLIP_H / 2);
  }
}

/** Reads the frame index from RGBA rows (top-down) of a W × H picture showing a coded frame full-frame. */
export function readCode(px: Uint8Array, W: number, H: number): number {
  let k = 0;
  for (let b = 0; b < BITS; b++) {
    const x = Math.floor(((b + 0.5) * W) / BITS);
    const y = Math.floor(H / 4);
    const i = (y * W + x) * 4;
    if (px[i]! + px[i + 1]! + px[i + 2]! > 3 * 128) k |= 1 << b;
  }
  return k;
}

/** Encodes a frame-coded clip: H.264 in MP4 where the encoder exists, else VP8 in WebM. */
export async function makeClip(spec: ClipSpec): Promise<File> {
  const h264: VideoEncoderConfig = {
    codec: 'avc1.42001e',
    width: CLIP_W,
    height: CLIP_H,
    bitrate: 2_000_000,
    framerate: spec.rate,
    latencyMode: 'realtime', // WebKit's H.264 encoder emits nothing in 'quality' mode (ADR-0004 outcome)
    avc: { format: 'avc' },
  };
  const vp8: VideoEncoderConfig = {
    codec: 'vp8',
    width: CLIP_W,
    height: CLIP_H,
    bitrate: 2_000_000,
    framerate: spec.rate,
  };
  const useH264 = (await VideoEncoder.isConfigSupported(h264)).supported === true;
  const config = useH264 ? h264 : vp8;
  const target = new BufferTarget();
  const output = new Output({ format: useH264 ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
  const source = new EncodedVideoPacketSource(useH264 ? 'avc' : 'vp8');
  output.addVideoTrack(source, { frameRate: spec.rate });
  await output.start();
  let chain: Promise<void> = Promise.resolve();
  let failure: Error | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      chain = chain.then(() => source.add(EncodedPacket.fromEncodedChunk(chunk), meta));
    },
    error: (e) => {
      failure = e;
    },
  });
  enc.configure(config);
  const canvas = new OffscreenCanvas(CLIP_W, CLIP_H);
  const g = canvas.getContext('2d')!;
  for (let k = 0; k < spec.frames; k++) {
    drawCoded(g, k);
    const ts = Math.floor((k * 1_000_000) / spec.rate);
    const frame = new VideoFrame(canvas, {
      timestamp: ts,
      duration: Math.floor(((k + 1) * 1_000_000) / spec.rate) - ts,
    });
    enc.encode(frame, { keyFrame: k % spec.gop === 0 });
    frame.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  await chain;
  await output.finalize();
  return new File([target.buffer ?? new ArrayBuffer(0)], useH264 ? 'coded.mp4' : 'coded.webm');
}

function clipOf(id: string, seconds: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    sourceId: `src-${id}`,
    kind: 'video',
    in: 0,
    out: Math.round(seconds * 1_000_000),
    speedPct: 100,
    volume: 100,
    muted: false,
    placement: DEFAULT_PLACEMENT,
    adjustments: {},
    look: null,
    fadeIn: 0,
    fadeOut: 0,
    crossFadeNext: 0,
    ...extra,
  };
}

export function codedProject(spec: ClipSpec, rate: 24 | 25 | 30 | 60 = 30): Project {
  const seconds = Math.floor((spec.frames * 1_000_000) / spec.rate) / 1_000_000;
  return {
    frame: { aspect: 'original', frameRate: rate, background: 'black' },
    sources: [
      {
        id: 'src-a',
        kind: 'video',
        name: 'coded',
        bytes: 1,
        duration: Math.round(seconds * 1e6),
        width: CLIP_W,
        height: CLIP_H,
        frameRate: spec.rate,
      },
    ],
    clips: [clipOf('a', seconds)],
    textLayers: [],
    audioClips: [],
  };
}

/** A W × 16 grey ramp (one step per column) as a bitmap. */
async function rampBitmap(): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(256, 16);
  const g = c.getContext('2d')!;
  for (let x = 0; x < 256; x++) {
    g.fillStyle = `rgb(${x},${x},${x})`;
    g.fillRect(x, 0, 1, 16);
  }
  return createImageBitmap(c);
}

function photoProject(
  width: number,
  height: number,
  adjustments: Adjustments,
  look: Look,
  background: 'black' | 'blur' = 'black',
): Project {
  return {
    frame: { aspect: 'original', frameRate: 30, background },
    sources: [{ id: 'src-p', kind: 'photo', name: 'p', bytes: 1, width, height }],
    clips: [
      {
        id: 'p',
        sourceId: 'src-p',
        kind: 'photo',
        duration: 3_000_000,
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

/** A main-thread Engine (ADR-0003 §7: the modules run on either thread) with a readable compositor. */
function pageEngine(): { engine: Engine; events: FromEngine[]; comp: () => Compositor } {
  let comp: Compositor | null = null;
  const events: FromEngine[] = [];
  const deps: EngineDeps = {
    post: (m) => events.push(m),
    createCompositor: (canvas, looks, o) => (comp = createCompositor(canvas, looks, { ...o, preserve: true })),
    openVideo: openVideoSource as unknown as EngineDeps['openVideo'],
    effectsCheck,
    coarseCopy: (f: EngineFrame) =>
      createImageBitmap(f as unknown as VideoFrame, { resizeWidth: 160, resizeHeight: 120 }),
    budget: BUDGETS.laptop,
    phone: false,
    now: () => performance.now(),
  };
  return {
    engine: new Engine(deps),
    events,
    comp: () => {
      if (!comp) throw new Error('no compositor');
      return comp;
    },
  };
}

let sync: {
  controller: PreviewController;
  playback: Playback;
  shown: { t: number; heard: number }[];
  started: number;
} | null = null;

export const videoHarness = {
  /** RULE-08 on the GPU: the 8-bit result for the 256-step grey ramp with these adjustments. */
  async gpuRamp(adjustments: Adjustments): Promise<number[]> {
    const bitmap = await rampBitmap();
    const canvas = new OffscreenCanvas(256, 16);
    const comp = createCompositor(canvas, new Map(), { preserve: true });
    const project = photoProject(256, 16, adjustments, null);
    comp.paint(framePlan(project, 0), [{ image: bitmap, width: 256, height: 16, rotation: 0 }]);
    const px = comp.readPixels();
    comp.dispose();
    bitmap.close();
    const row = 8 * 256 * 4;
    return Array.from(px.subarray(row, row + 256 * 4));
  },

  /** ADR-0006 outcome rule 6: paint, lose the context, restore it, recover, paint again. */
  async contextLoss(restoreAfterMs = 500): Promise<{
    before: number[];
    after: number[];
    lostSeen: boolean;
    lostFlag: boolean;
    recovered: boolean;
    ms: number;
  }> {
    const bitmap = await rampBitmap();
    const canvas = new OffscreenCanvas(256, 16);
    const comp = createCompositor(canvas, new Map(), { preserve: true });
    const project = photoProject(256, 16, { contrast: 30 }, null);
    const frame = { image: bitmap, width: 256, height: 16, rotation: 0 as const };
    comp.paint(framePlan(project, 0), [frame]);
    const before = Array.from(comp.readPixels().subarray(8 * 1024, 8 * 1024 + 1024));
    let lostSeen = false;
    comp.onContextLost(() => {
      lostSeen = true;
    });
    const ext = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 50));
    const lostFlag = comp.lost;
    setTimeout(() => ext.restoreContext(), restoreAfterMs);
    const t0 = performance.now();
    let recovered = true;
    try {
      await comp.recover();
    } catch {
      recovered = false;
    }
    const ms = performance.now() - t0;
    let after: number[] = [];
    if (recovered) {
      comp.paint(framePlan(project, 0), [frame]);
      after = Array.from(comp.readPixels().subarray(8 * 1024, 8 * 1024 + 1024));
    }
    comp.dispose();
    bitmap.close();
    return { before, after, lostSeen, lostFlag, recovered, ms };
  },

  /** F-002.R1 on the GPU: a coded clip decoded and painted full-frame at a source time; its frame index. */
  async engineSeeks(
    spec: ClipSpec,
    times: number[],
    projectRate: 24 | 25 | 30 | 60 = 30,
    /** The clip's in point in µs of source time (F-004.AC7). */
    inPoint = 0,
  ): Promise<{ codes: number[]; exact: boolean[]; ms: number[] }> {
    const file = await makeClip(spec);
    const { engine, events, comp } = pageEngine();
    engine.handle({
      type: 'engine:canvas',
      canvas: new OffscreenCanvas(CLIP_W, CLIP_H),
      width: CLIP_W,
      height: CLIP_H,
    });
    engine.handle({ type: 'engine:media', media: [{ id: 'src-a', kind: 'video', file }] });
    const coded = codedProject(spec, projectRate);
    const project = { ...coded, clips: coded.clips.map((c) => ({ ...c, in: inPoint })) };
    engine.handle({ type: 'engine:setProject', project });
    await engine.settled();
    const codes: number[] = [];
    const exact: boolean[] = [];
    const ms: number[] = [];
    for (const t of times) {
      const t0 = performance.now();
      engine.handle({ type: 'engine:seek', t });
      await engine.settled();
      ms.push(performance.now() - t0);
      const shown = events.filter((e) => e.type === 'engine:frameShown').at(-1) as Extract<
        FromEngine,
        { type: 'engine:frameShown' }
      >;
      exact.push(shown.exact);
      codes.push(readCode(comp().readPixels(), CLIP_W, CLIP_H));
    }
    engine.release();
    return { codes, exact, ms };
  },

  /** Sets up the real engine worker, audio worker and clock behind a preview; `#play` starts it. */
  async prepareSync(spec: ClipSpec): Promise<void> {
    const file = await makeClip(spec);
    const project = codedProject(spec);
    const engineWorker = startEngineWorker();
    const audioWorker = startAudioWorker();
    const playback = new Playback(audioWorker, WORKLET_URL);
    const seconds = spec.frames / spec.rate + 1;
    const n = Math.ceil(seconds * 48_000);
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.05 * Math.sin((2 * Math.PI * 440 * i) / 48_000);
    const R = L.slice();
    audioWorker.postMessage({ type: 'audio:pcm', sourceId: 'src-a', L, R }, [L.buffer, R.buffer]);
    audioWorker.postMessage({ type: 'audio:setProject', project });
    engineWorker.postMessage({ type: 'engine:media', media: [{ id: 'src-a', kind: 'video', file }] });
    const host = document.createElement('div');
    host.style.width = '320px';
    host.style.height = '240px';
    document.body.append(host);
    const controller = mountPreview(host, { project: signal(project) }, { engine: engineWorker, clock: playback });
    const shown: { t: number; heard: number }[] = [];
    engineWorker.addEventListener('message', (e: MessageEvent<FromEngine>) => {
      if (e.data.type === 'engine:frameShown' && controller.state.peek() === 'playing')
        shown.push({ t: e.data.t, heard: playback.now() });
    });
    sync = { controller, playback, shown, started: 0 };
    const button = document.createElement('button');
    button.id = 'play';
    button.textContent = 'play';
    button.onclick = () => {
      if (!sync) return;
      sync.started = performance.now();
      sync.controller.play(); // inside the gesture: Playback.unlock creates the AudioContext
    };
    document.body.append(button);
  },

  /** What was measured since `#play`: frames shown with the clock time at arrival, and engine stats. */
  async syncResult(): Promise<{
    shown: { t: number; heard: number }[];
    stats: unknown;
    state: string;
    time: number;
    frameUs: number;
  }> {
    if (!sync) throw new Error('prepareSync first');
    const stats = await sync.controller.stats();
    return {
      shown: sync.shown,
      stats,
      state: sync.controller.state.peek(),
      time: sync.controller.time.peek(),
      frameUs: frameStart(1, 30),
    };
  },

  /** The playing state's clock (the audio context runs). */
  clockRunning(): boolean {
    return sync !== null && sync.controller.state.peek() === 'playing' && sync.playback.now() > 0;
  },

  /**
   * F-009 on the GPU: a cross-fade on white whose second clip has no frame. Returns the centre pixel
   * and the plan's weights (the missing clip must contribute its background, not darken the picture).
   */
  async crossFadeMissing(): Promise<{ px: number[]; w0: number; w1: number }> {
    const c = new OffscreenCanvas(64, 36);
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(0, 0, 64, 36);
    const red = await createImageBitmap(c);
    const base = photoProject(64, 36, {}, null);
    const clip = base.clips[0]!;
    const project: Project = {
      ...base,
      frame: { aspect: '16:9', frameRate: 30, background: 'white' },
      clips: [
        { ...clip, id: 'p1', crossFadeNext: 1_000_000 },
        { ...clip, id: 'p2' },
      ],
    };
    const comp = createCompositor(new OffscreenCanvas(64, 36), new Map(), { preserve: true });
    const plan = framePlan(project, 75); // inside the 1 s cross-fade (frames 60–89)
    comp.paint(plan, [{ image: red, width: 64, height: 36, rotation: 0 }, null]);
    const all = comp.readPixels();
    const i = (18 * 64 + 32) * 4;
    comp.dispose();
    red.close();
    return { px: Array.from(all.subarray(i, i + 3)), w0: plan.layers[0]!.weight, w1: plan.layers[1]!.weight };
  },

  /** Text textures of layers no longer given are deleted (counts before and after). */
  async textTextures(): Promise<[number, number]> {
    const c = new OffscreenCanvas(16, 8);
    c.getContext('2d')!.fillRect(0, 0, 16, 8);
    const bitmap = await createImageBitmap(c, { premultiplyAlpha: 'premultiply' });
    const base = photoProject(64, 36, {}, null);
    const text = (id: string) => ({
      id,
      content: id,
      start: 0,
      end: 3_000_000,
      typeface: 'sans' as const,
      size: 6,
      colour: 'white' as const,
      style: 'plain' as const,
      align: 'centre' as const,
      x: 0.5,
      y: 0.5,
      fade: false,
    });
    const project: Project = { ...base, textLayers: [text('t1'), text('t2')] };
    const comp = createCompositor(new OffscreenCanvas(64, 36), new Map(), { preserve: true });
    const plan = framePlan(project, 0);
    comp.paint(
      plan,
      [null],
      new Map([
        ['t1', { bitmap, s: 36 }],
        ['t2', { bitmap, s: 36 }],
      ]),
    );
    const before = comp.textTextures;
    comp.paint(plan, [null], new Map([['t1', { bitmap, s: 36 }]]));
    const after = comp.textTextures;
    comp.dispose();
    bitmap.close();
    return [before, after];
  },

  /** RULE-22 effects check in this engine. */
  effects: () => effectsCheck(),
};
