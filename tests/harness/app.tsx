// App harness (test-only, tests/harness/app.html; adapters/tests.md "Device support"): boots the real
// MOD-App `main()` and workers with the browser's device, except the engine worker's effects check,
// which the address can replace (a worker's globals can't be changed from a test):
//   ?effects=fast     the chain draws and is fast enough (no slow-device notice; F-001 tests)
//   ?effects=slow     the chain draws, then the timed result is below 30 fps (F-023.AC6)
//   ?effects=fail     the effect chain cannot be drawn (RULE-22 missing_effects after the codec probe)
//   ?effects=pending  no answer (and no timeout) until the test calls `window.appHarness.draw()`
//   ?gate=N           (F-001.R6) the analysis worker gets the first N probe requests; later ones are held
//                     until `window.appHarness.release()`, so a test can watch a file being checked
// `window.appHarness.project()` reads the session's project, `clips()` the main track and the selection
// (F-003), `setClip()` sets what has no control yet (photo length, speed, look, cross-fade), and `undo()`
// takes one RULE-13 step back (the Undo button is F-014). For F-014's criteria whose controls come later:
// `split()` splits a clip (F-004), `typeText()` adds a text layer and types it in one editing session
// (F-010's CMP-TextEditor), `slide()` drags a clip's brightness through values in one movement (F-007's
// sliders), each through the same MOD-Project operations and gesture API those features use; `state()`
// is the whole project as JSON (to compare a restored project). `preview()` reads the playback state (F-002),
// `setPlayhead()` moves MOD-Project's playhead as F-003's timeline will (the playhead binding),
// `scrub()` measures how soon the preview shows each playhead time (NFR-03), and `feedTone()` gives the
// audio worker a 440 Hz tone as a source's 48 kHz sound (the clock and worklet path without decoding).
//   ?tap=1            the blocks the audio worker sends the worklet are relayed through this page and
//                     recorded (`heard()`), so a test can check the sound the preview plays, sample-exact
//                     with its project position; `toneClip()` makes a clip with a tone in its sound track.
// F-012: `frame()` reads the frame settings, `frames()` each clip's length in frames, `load()` puts a
// project in place as one step (AC5's 10-minute project), `halves()` makes a 16:9 test photo,
// `codedClip()` a frame-coded clip at a given rate (AC2), and `pixels()` reads a screenshot's colours.
// The codec interfaces and WebGL2 are tested on the production build instead, by changing them on the
// page before it loads (the presence check and the codec probe run on the main thread).
import '../../src/app/styles/index.css';
import { truePeak } from '../../src/audio';
import { LUT_BYTES, LUT_N } from '../../src/compositor';
import { nextItemId, queued } from '../../src/app/adding';
import { main } from '../../src/app/app';
import { browserDevice, type DeviceDeps, type EffectsRun } from '../../src/app/device';
import { playback } from '../../src/app/playback';
import { workers } from '../../src/app/workers';
import {
  frameStart,
  layoutOf,
  type Adjustments,
  type Frame,
  type FromEngine,
  type Placement,
  type Project,
  type ToEngine,
} from '../../src/core';
import {
  addText,
  beginGesture,
  edit,
  editText,
  finishText,
  history,
  playhead,
  project,
  selection,
  setCrossFade,
  setLook,
  setAdjustments,
  setPhotoDuration,
  setSpeed,
  splitAt,
  undo,
} from '../../src/project';
import { analyseTone, makeToneClip, type ToneReport, type ToneSpec } from './sound';
import { makeClip } from './video';

/** The session's project as a test reads it (times in seconds). */
export interface ProjectSummary {
  readonly sources: readonly { readonly name: string; readonly kind: string; readonly hasSound: boolean }[];
  readonly clips: readonly { readonly source: string; readonly start: number }[];
  readonly audio: readonly { readonly source: string; readonly start: number; readonly end: number }[];
  readonly steps: number;
  readonly texts: readonly string[];
}

/** F-003: the main track as a test reads it (times in seconds). */
export interface ClipSummary {
  readonly source: string;
  readonly start: number;
  readonly end: number;
  /** The cross-fade into the next clip. */
  readonly crossFade: number;
  readonly speed: number;
  readonly look: string | null;
  /** F-008: the look's intensity (null: None). */
  readonly intensity: number | null;
  readonly selected: boolean;
  /** F-006: the clip's placement (RULE-07). */
  readonly placement: Placement;
  /** F-007: the clip's adjustments (RULE-08; values at their default are not stored). */
  readonly adjustments: Adjustments;
}

/** Settings the editor has no control for yet (F-004 photo length, F-005 speed, F-008 look, F-009 cross-fade). */
export interface ClipSetup {
  readonly seconds?: number;
  readonly speedPct?: number;
  readonly look?: string;
  /** Tenths of a second. */
  readonly crossFadeTenths?: number;
}

declare global {
  interface Window {
    appHarness: {
      draw(): void;
      /** F-012: the session's frame settings. */
      frame(): Frame;
      /** Replaces the session's project with `json` as one undo step (settings with no control yet). */
      load(json: string): void;
      /** Each main-track clip's length in frames at the project's rate. */
      frames(): number[];
      /** A W × H PNG, left half red and right half blue. */
      halves(width: number, height: number): Promise<number[]>;
      /**
       * F-007: gives the engine worker a look table `id` that turns every colour grey (Rec. 709 luma), so a
       * look shows in the preview before F-008 loads the bundled tables.
       */
      greyLook(id: string): void;
      /** F-007: a W × H PNG of equal vertical stripes in these colours. */
      stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]>;
      /** A frame-coded H.264 (or VP8) clip at `rate` fps (tests/harness/video.ts). */
      codedClip(rate: number, frames: number): Promise<number[]>;
      /** RGB of a PNG screenshot (base64) at fractional points. */
      pixels(
        png: string,
        points: readonly (readonly [number, number])[],
      ): Promise<{ width: number; height: number; at: number[][] }>;
      workers(): number;
      project(): ProjectSummary;
      clips(): ClipSummary[];
      setClip(index: number, setup: ClipSetup): void;
      undo(): void;
      split(index: number, seconds: number): void;
      typeText(seconds: number, content: string): void;
      slide(index: number, values: number[]): void;
      state(): string;
      setPlayhead(seconds: number): void;
      release(): void;
      queued(): number;
      preview(): PreviewSummary;
      scrub(frames: number[]): Promise<number[]>;
      feedTone(sourceName: string, seconds: number): void;
      sync(): Promise<SyncSummary>;
      toneClip(spec: ToneSpec): Promise<number[]>;
      heard(spec: ToneSpec, hashed: number): HeardSummary;
      /** F-011.AC5: the true peak (dBTP) and RMS (dBFS) of the sound the worklet was sent in the last generation. */
      heardLevels(): { truePeakDb: number; rmsDb: number; seconds: number };
    };
  }
}

/** The preview's playback state as a test reads it (times in seconds). */
export interface PreviewSummary {
  readonly mounted: boolean;
  readonly state: string;
  readonly time: number;
  readonly playhead: number;
  readonly duration: number;
  /** The last frame on screen. */
  readonly shown: { readonly t: number; readonly frameIndex: number; readonly exact: boolean } | null;
  readonly fullscreen: string;
}

/** Frames shown while playing, each with the sound clock's time when it arrived (seconds). */
export interface SyncSummary {
  readonly shown: { readonly t: number; readonly heard: number }[];
  readonly played: number;
  readonly underruns: number;
  /** The worklet's FNV-1a of the samples it played since the last flush (L), and how many. */
  readonly hashL: string;
  readonly hashed: number;
}

/** The sound the worklet was sent in the last generation (?tap=1), analysed as a tone. */
export interface HeardSummary extends ToneReport {
  /** Project time of the first block (s), and of the end of the last. */
  readonly from: number;
  readonly to: number;
  /** FNV-1a of the first `n` samples of L sent (to compare with the worklet's hash of what it played). */
  readonly hashL: string;
  readonly blocks: number;
}

// ?tap=1: relay the worker → worklet channel through this page and record the blocks.
const tapped: { gen: number; from: number; L: Float32Array; R: Float32Array }[] = [];
if (params().get('tap')) {
  const post = MessagePort.prototype.postMessage as (this: MessagePort, m: unknown, t?: Transferable[]) => void;
  MessagePort.prototype.postMessage = function (this: MessagePort, m: unknown, t?: Transferable[]) {
    const msg = m as { type?: string; port?: MessagePort } | null;
    if (msg?.type !== 'connect' || !(msg.port instanceof MessagePort)) return post.call(this, m, t);
    const fromWorker = msg.port;
    const relay = new MessageChannel();
    fromWorker.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: string; gen: number; from: number; L: Float32Array; R: Float32Array };
      if (d.type === 'block') tapped.push({ gen: d.gen, from: d.from, L: d.L.slice(), R: d.R.slice() });
      post.call(relay.port1, d, d.type === 'block' ? [d.L.buffer, d.R.buffer] : []);
    };
    relay.port1.onmessage = (e: MessageEvent) => post.call(fromWorker, e.data);
    return post.call(this, { ...msg, port: relay.port2 }, [relay.port2]);
  } as MessagePort['postMessage'];
}

function fnv(a: Float32Array, n: number): string {
  const u = new Uint8Array(a.buffer, a.byteOffset, Math.min(n, a.length) * 4);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i]!, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function heard(spec: ToneSpec, n: number): HeardSummary {
  const gen = Math.max(...tapped.map((b) => b.gen));
  const blocks = tapped.filter((b) => b.gen === gen).sort((a, b) => a.from - b.from);
  const from = blocks[0]?.from ?? 0;
  const to = blocks.reduce((m, b) => Math.max(m, b.from + b.L.length), from);
  const L = new Float32Array(to - from);
  const R = new Float32Array(to - from);
  for (const b of blocks) {
    L.set(b.L, b.from - from);
    R.set(b.R, b.from - from);
  }
  const hashL = fnv(L, n);
  return { ...analyseTone(L, R, from, spec), from: from / 48_000, to: to / 48_000, blocks: blocks.length, hashL };
}

function heardLevels(): { truePeakDb: number; rmsDb: number; seconds: number } {
  const gen = Math.max(...tapped.map((b) => b.gen));
  const blocks = tapped.filter((b) => b.gen === gen).sort((a, b) => a.from - b.from);
  const n = blocks.reduce((m, b) => m + b.L.length, 0);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let at = 0;
  let sum = 0;
  for (const b of blocks) {
    L.set(b.L, at);
    R.set(b.R, at);
    at += b.L.length;
    for (let i = 0; i < b.L.length; i++) sum += (b.L[i]! * b.L[i]! + b.R[i]! * b.R[i]!) / 2;
  }
  return { truePeakDb: truePeak([L, R]).dB, rmsDb: 10 * Math.log10(sum / Math.max(1, n)), seconds: n / 48_000 };
}

function params(): URLSearchParams {
  return new URLSearchParams(location.search);
}
const effects = params().get('effects');
const real = browserDevice(() => workers.get('engine'));
let draw: () => void = () => undefined;

// ?gate=N — hold probe requests after the first N (F-001.AC8: the second file stays "being checked").
const held: (() => void)[] = [];
const gate = Number(params().get('gate') ?? NaN);
if (Number.isInteger(gate)) {
  const post = Worker.prototype.postMessage as (this: Worker, ...args: unknown[]) => void;
  let probes = 0;
  Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
    if ((args[0] as { type?: string } | null)?.type === 'probe' && ++probes > gate) {
      held.push(() => post.apply(this, args));
      return;
    }
    post.apply(this, args);
  } as Worker['postMessage'];
}

const S = 1_000_000;
function summary(): ProjectSummary {
  const p = project.value;
  const name = (id: string) => p.sources.find((s) => s.id === id)?.name ?? id;
  const spans = layoutOf(p).spans;
  return {
    sources: p.sources.map((s) => ({ name: s.name, kind: s.kind, hasSound: s.hasSound === true })),
    clips: p.clips.map((c, i) => ({
      source: name(c.sourceId),
      start: Math.round((spans[i]!.startFrame / p.frame.frameRate) * 1000) / 1000,
    })),
    audio: p.audioClips.map((a) => ({
      source: name(a.sourceId),
      start: a.start / S,
      end: (a.start + a.out - a.in) / S,
    })),
    steps: history.value.past.length,
    texts: p.textLayers.map((t) => t.content),
  };
}

const round = (us: number): number => Math.round(us / 1000) / 1000;
function clipsSummary(): ClipSummary[] {
  const p = project.value;
  const rate = p.frame.frameRate;
  const spans = layoutOf(p).spans;
  return p.clips.map((c, i) => ({
    source: p.sources.find((s) => s.id === c.sourceId)?.name ?? c.sourceId,
    start: round(frameStart(spans[i]!.startFrame, rate)),
    end: round(frameStart(spans[i]!.endFrame, rate)),
    crossFade: round(c.crossFadeNext),
    speed: c.speedPct ?? 100,
    look: c.look?.id ?? null,
    intensity: c.look?.intensity ?? null,
    selected: selection.value.includes(c.id),
    placement: c.placement,
    adjustments: c.adjustments,
  }));
}

function setClip(index: number, setup: ClipSetup): void {
  const id = project.peek().clips[index]?.id;
  if (!id) throw new Error(`no clip ${index}`);
  if (setup.seconds !== undefined) edit((p) => setPhotoDuration(p, id, Math.round(setup.seconds! * S)));
  if (setup.speedPct !== undefined) edit((p) => setSpeed(p, id, setup.speedPct!));
  if (setup.look !== undefined) edit((p) => setLook(p, id, { id: setup.look!, intensity: 100 }));
  if (setup.crossFadeTenths !== undefined) edit((p) => setCrossFade(p, id, setup.crossFadeTenths!));
}

/** F-004's split at a project time inside clip `index` (its control is not built yet). */
function split(index: number, seconds: number): void {
  const id = project.peek().clips[index]?.id;
  if (!id) throw new Error(`no clip ${index}`);
  edit((p) => splitAt(p, id, Math.round(seconds * S), nextItemId));
}

/** F-010: Add text at a time, typed character by character, then finished: one editing session. */
function typeText(seconds: number, content: string): void {
  const g = beginGesture();
  g.edit((p) => addText(p, Math.round(seconds * S), nextItemId));
  const id = project.peek().textLayers.at(-1)!.id;
  for (let i = 1; i <= content.length; i++) g.edit((p) => editText(p, id, content.slice(0, i)));
  g.edit((p) => finishText(p, id));
  g.end();
}

/** F-007: one brightness slider movement through `values`. */
function slide(index: number, values: number[]): void {
  const id = project.peek().clips[index]?.id;
  if (!id) throw new Error(`no clip ${index}`);
  const g = beginGesture();
  for (const v of values) g.edit((p) => setAdjustments(p, id, { brightness: v }));
  g.end();
}

function previewSummary(): PreviewSummary {
  const p = playback.peek();
  const shown = p?.ctl.shown.peek() ?? null;
  return {
    mounted: p !== null,
    state: p?.ctl.state.peek() ?? 'none',
    time: (p?.ctl.time.peek() ?? 0) / S,
    playhead: playhead.peek() / S,
    duration: (p?.ctl.duration.peek() ?? 0) / S,
    shown: shown ? { t: shown.t / S, frameIndex: shown.frameIndex, exact: shown.exact } : null,
    fullscreen: p?.fs.mode.peek() ?? 'off',
  };
}

/** For each project frame: set the playhead to its start, then the milliseconds until the engine shows it. */
async function scrub(frames: number[]): Promise<number[]> {
  const engine = workers.get('engine');
  if (!engine) throw new Error('engine not running');
  const rate = project.peek().frame.frameRate;
  const out: number[] = [];
  for (const k of frames) {
    const t0 = performance.now();
    const shown = new Promise<void>((resolve) => {
      const on = (e: MessageEvent<FromEngine>) => {
        if (e.data.type !== 'engine:frameShown' || e.data.frameIndex !== k) return;
        engine.removeEventListener('message', on);
        resolve();
      };
      engine.addEventListener('message', on);
    });
    playhead.value = frameStart(k, rate);
    await shown;
    out.push(performance.now() - t0);
  }
  return out;
}

const synced: { t: number; heard: number }[] = [];
let syncing = false;
function watchSync(): void {
  if (syncing) return;
  syncing = true;
  workers.get('engine')?.addEventListener('message', (e: MessageEvent<FromEngine>) => {
    const p = playback.peek();
    if (e.data.type === 'engine:frameShown' && p?.ctl.state.peek() === 'playing')
      synced.push({ t: e.data.t / S, heard: p.clock.now() / S });
  });
}

/** F-012: a W × H PNG, its left half red and its right half blue (a photo the frame tests add). */
async function halves(width: number, height: number): Promise<number[]> {
  const c = new OffscreenCanvas(width, height);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, width / 2, height);
  g.fillStyle = '#0000ff';
  g.fillRect(width / 2, 0, width - width / 2, height);
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
}

/** F-007: a W × H PNG of equal vertical stripes in these colours (RGB 0–255), left to right. */
async function stripes(width: number, height: number, colours: readonly (readonly number[])[]): Promise<number[]> {
  const c = new OffscreenCanvas(width, height);
  const g = c.getContext('2d')!;
  colours.forEach(([r, gr, b], i) => {
    const x0 = Math.round((i * width) / colours.length);
    const x1 = Math.round(((i + 1) * width) / colours.length);
    g.fillStyle = `rgb(${r},${gr},${b})`;
    g.fillRect(x0, 0, x1 - x0, height);
  });
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
}

/** RGB (0–255) of a PNG (a Playwright screenshot, base64) at points given as fractions of its size. */
async function pixels(
  png: string,
  points: readonly (readonly [number, number])[],
): Promise<{ width: number; height: number; at: number[][] }> {
  const bytes = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const at = points.map(([fx, fy]) => {
    const x = Math.min(bmp.width - 1, Math.floor(fx * bmp.width));
    const y = Math.min(bmp.height - 1, Math.floor(fy * bmp.height));
    return Array.from(g.getImageData(x, y, 1, 1).data.subarray(0, 3));
  });
  return { width: bmp.width, height: bmp.height, at };
}

window.appHarness = {
  draw: () => draw(),
  frame: () => ({ ...project.peek().frame }),
  load(json) {
    edit(() => ({ project: JSON.parse(json) as Project, notices: [], changed: [] }));
  },
  frames: () => layoutOf(project.peek()).spans.map((s) => s.frames),
  halves,
  stripes,
  greyLook(id) {
    const n = LUT_N;
    const table = new Uint8Array(LUT_BYTES);
    for (let b = 0; b < n; b++)
      for (let g = 0; g < n; g++)
        for (let r = 0; r < n; r++) {
          const y = Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) * 255) / (n - 1));
          const i = ((b * n + g) * n + r) * 4;
          table[i] = y;
          table[i + 1] = y;
          table[i + 2] = y;
          table[i + 3] = 255;
        }
    workers.get('engine')?.postMessage({ type: 'engine:looks', tables: { [id]: table } } satisfies ToEngine);
  },
  async codedClip(rate, frames) {
    return Array.from(new Uint8Array(await (await makeClip({ rate, frames, gop: rate })).arrayBuffer()));
  },
  pixels,
  workers: () => workers.size,
  project: summary,
  clips: clipsSummary,
  setClip,
  undo,
  split,
  typeText,
  slide,
  state: () => JSON.stringify(project.peek()),
  setPlayhead: (seconds) => (playhead.value = Math.round(seconds * S)),
  release: () => held.splice(0).forEach((f) => f()),
  queued: () => queued.value,
  preview: previewSummary,
  scrub,
  feedTone(sourceName, seconds) {
    const source = project.peek().sources.find((x) => x.name === sourceName);
    const audio = workers.get('audio');
    if (!source || !audio) throw new Error(`no source ${sourceName} or no audio worker`);
    const n = Math.ceil(seconds * 48_000);
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / 48_000);
    const R = L.slice();
    audio.postMessage({ type: 'audio:pcm', sourceId: source.id, L, R }, [L.buffer, R.buffer]);
    watchSync();
  },
  async sync() {
    const p = playback.peek();
    p?.clock.requestStats();
    await new Promise((r) => setTimeout(r, 100));
    const stats = p?.clock.stats;
    return {
      shown: synced.slice(),
      played: stats?.played ?? 0,
      underruns: stats?.underrunEvents ?? 0,
      hashL: stats?.hashL ?? '',
      hashed: stats?.hashed ?? 0,
    };
  },
  async toneClip(spec) {
    watchSync();
    return Array.from(new Uint8Array(await (await makeToneClip(spec)).arrayBuffer()));
  },
  heard,
  heardLevels,
};

const fixed = (ok: boolean, slow: boolean): EffectsRun => ({
  drawn: Promise.resolve(ok),
  timed: Promise.resolve({ slow }),
});

const device: DeviceDeps = {
  ...real,
  ...(effects === 'pending' ? { timeouts: { drawnMs: 600_000, timedMs: 600_000 } } : {}),
  effects: () => {
    if (effects === 'fast') return fixed(true, false);
    if (effects === 'slow') return fixed(true, true);
    if (effects === 'fail') return fixed(false, false);
    if (effects === 'pending') {
      return {
        drawn: new Promise<boolean>((r) => (draw = () => r(true))),
        timed: new Promise(() => undefined),
      };
    }
    return real.effects();
  },
};

void main({ device });
