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
// takes one RULE-13 step back (the Undo button is F-014). `preview()` reads the playback state (F-002),
// `setPlayhead()` moves MOD-Project's playhead as F-003's timeline will (the playhead binding),
// `scrub()` measures how soon the preview shows each playhead time (NFR-03), and `feedTone()` gives the
// audio worker a 440 Hz tone as a source's 48 kHz sound (the clock and worklet path without decoding).
//   ?tap=1            the blocks the audio worker sends the worklet are relayed through this page and
//                     recorded (`heard()`), so a test can check the sound the preview plays, sample-exact
//                     with its project position; `toneClip()` makes a clip with a tone in its sound track.
// The codec interfaces and WebGL2 are tested on the production build instead, by changing them on the
// page before it loads (the presence check and the codec probe run on the main thread).
import '../../src/app/styles/index.css';
import { queued } from '../../src/app/adding';
import { main } from '../../src/app/app';
import { browserDevice, type DeviceDeps, type EffectsRun } from '../../src/app/device';
import { playback } from '../../src/app/playback';
import { workers } from '../../src/app/workers';
import { frameStart, layoutOf, type FromEngine } from '../../src/core';
import {
  edit,
  history,
  playhead,
  project,
  selection,
  setCrossFade,
  setLook,
  setPhotoDuration,
  setSpeed,
  undo,
} from '../../src/project';
import { analyseTone, makeToneClip, type ToneReport, type ToneSpec } from './sound';

/** The session's project as a test reads it (times in seconds). */
export interface ProjectSummary {
  readonly sources: readonly { readonly name: string; readonly kind: string; readonly hasSound: boolean }[];
  readonly clips: readonly { readonly source: string; readonly start: number }[];
  readonly audio: readonly { readonly source: string; readonly start: number; readonly end: number }[];
  readonly steps: number;
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
  readonly selected: boolean;
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
      workers(): number;
      project(): ProjectSummary;
      clips(): ClipSummary[];
      setClip(index: number, setup: ClipSetup): void;
      undo(): void;
      setPlayhead(seconds: number): void;
      release(): void;
      queued(): number;
      preview(): PreviewSummary;
      scrub(frames: number[]): Promise<number[]>;
      feedTone(sourceName: string, seconds: number): void;
      sync(): Promise<SyncSummary>;
      toneClip(spec: ToneSpec): Promise<number[]>;
      heard(spec: ToneSpec, hashed: number): HeardSummary;
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
    selected: selection.value.includes(c.id),
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

window.appHarness = {
  draw: () => draw(),
  workers: () => workers.size,
  project: summary,
  clips: clipsSummary,
  setClip,
  undo,
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
