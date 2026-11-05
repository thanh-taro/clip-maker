// MOD-Audio playback: the audio worker's streamer (400 ms lead, flush on seek, the export's samples)
// and the main-thread controller (gesture, audio session, bounded resume, master clock), with fakes.
import { describe, expect, it, vi } from 'vitest';
import {
  bankOf,
  boundedResume,
  endSampleOf,
  pcmSource,
  Playback,
  PLAYBACK_LEAD,
  renderOffline,
  Streamer,
  type AudioEnv,
  type FromWorkletNode,
  type ToAudioWorker,
  type ToWorklet,
} from '../../src/audio';
import { voices } from '../../src/plan';
import { proj, S, video } from '../support/project';
import { hash, material, SR } from '../support/audio';

function fakePort() {
  const sent: ToWorklet[] = [];
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: (m: ToWorklet) => sent.push(m),
    played(gen: number, played: number) {
      port.onmessage?.({ data: { type: 'played', gen, played } } as MessageEvent);
    },
  };
  return { port, sent };
}

describe('MOD-Audio streamer (audio worker)', () => {
  const project = proj({ clips: [video('a', 3, { speedPct: 150 })] });
  const sources = bankOf(new Map([['src-a', pcmSource(material(5, 1), material(5, 2))]]));

  it('MOD-Audio keeps 400 ms queued ahead of what the worklet played', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.play(0, 1);
    expect(sent[0]).toEqual({ type: 'flush', gen: 1, from: 0 });
    const queued = () => sent.reduce((n, m) => n + (m.type === 'block' ? m.L.length : 0), 0);
    expect(queued()).toBeGreaterThanOrEqual(PLAYBACK_LEAD);
    expect(queued()).toBeLessThan(PLAYBACK_LEAD + 1024);
    port.played(1, 10_000);
    expect(queued()).toBeGreaterThanOrEqual(PLAYBACK_LEAD + 10_000);
    port.played(0, 40_000); // an older generation's report is ignored
    expect(queued()).toBeLessThan(PLAYBACK_LEAD + 10_000 + 1024);
    expect(PLAYBACK_LEAD).toBe(0.4 * SR);
  });

  it('INV-02 F-011.R5 the preview streams the same samples as the export render, and ends at the project end', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.play(0, 7);
    const end = endSampleOf(project);
    for (let played = 0; !sent.some((m) => m.type === 'end'); played += 4096) port.played(7, played);
    const L = new Float32Array(end);
    const R = new Float32Array(end);
    for (const m of sent) {
      if (m.type !== 'block') continue;
      L.set(m.L, m.from);
      R.set(m.R, m.from);
    }
    const eL = new Float32Array(end);
    const eR = new Float32Array(end);
    renderOffline(voices(project), sources, end, (l, r, at) => (eL.set(l, at), eR.set(r, at)));
    expect(hash(L, R)).toBe(hash(eL, eR));
    expect(sent.at(-1)).toEqual({ type: 'end', gen: 7, at: end });
  });

  it('MOD-Audio a seek while playing flushes the queue and streams from the new position', () => {
    const { port, sent } = fakePort();
    const s = new Streamer(sources);
    s.connect(port);
    s.setProject(project);
    s.play(0, 1);
    sent.length = 0;
    s.seek(1 * S, 2);
    expect(sent[0]).toEqual({ type: 'flush', gen: 2, from: SR });
    const first = sent[1];
    expect(first?.type === 'block' && first.from).toBe(SR);
    s.pause(3);
    expect(sent.at(-1)).toEqual({ type: 'flush', gen: 3, from: SR });
  });
});

/** A fake browser environment with a controllable context. */
function fakeEnv() {
  const log: string[] = [];
  const session = { type: 'auto' };
  let pageReturn = () => {};
  const timers: (() => void)[] = [];
  const ctx = {
    state: 'suspended',
    sampleRate: SR,
    currentTime: 0,
    outputLatency: 0.02,
    baseLatency: 0.005,
    destination: {},
    statechange: () => {},
    resumeSettles: true,
    audioWorklet: { addModule: async (url: string) => void log.push(`addModule ${url}`) },
    getOutputTimestamp: undefined as undefined | (() => { contextTime: number; performanceTime: number }),
    resume() {
      log.push('resume');
      if (!ctx.resumeSettles) return new Promise<void>(() => {});
      ctx.state = 'running';
      return Promise.resolve();
    },
    close: async () => void (ctx.state = 'closed'),
    addEventListener: (_: 'statechange', fn: () => void) => void (ctx.statechange = fn),
  };
  const node = {
    port: {
      onmessage: null as ((e: MessageEvent<FromWorkletNode>) => void) | null,
      postMessage: (m: { type: string }) => void log.push(`node ${m.type}`),
    },
    connect: () => log.push('connect'),
    disconnect: () => {},
  };
  const env: AudioEnv = {
    createContext: () => (log.push(`context (session ${session.type})`), ctx),
    createNode: () => node,
    createChannel: () => ({ port1: {} as MessagePort, port2: {} as MessagePort }),
    audioSession: () => session,
    onPageReturn: (fn) => void (pageReturn = fn),
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
    now: () => 0,
  };
  const toWorker: ToAudioWorker[] = [];
  const worker = { postMessage: (m: ToAudioWorker) => void toWorker.push(m) };
  const fromWorklet = (m: FromWorkletNode) => node.port.onmessage?.({ data: m } as MessageEvent<FromWorkletNode>);
  return { log, session, ctx, env, worker, toWorker, fromWorklet, timers, pageReturn: () => pageReturn() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MOD-Audio playback controller', () => {
  it('MOD-Audio sets the playback audio session before creating the context in the gesture (D-046)', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    p.unlock();
    expect(f.session.type).toBe('playback');
    expect(f.log.slice(0, 2)).toEqual(['context (session playback)', 'resume']);
    await flush();
    expect(f.log).toContain('addModule /w.js');
    expect(f.log).toContain('node connect');
    expect(f.toWorker[0]?.type).toBe('audio:port');
  });

  it('MOD-Audio play posts to the worker after the worklet is wired; the clock follows the worklet', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    await p.play(2 * S);
    expect(f.toWorker.at(-1)).toEqual({ type: 'audio:play', from: 2 * S, gen: 1 });
    expect(p.now()).toBe(2 * S);
    // The worklet started project sample 96 000 at context frame 4800; 0.5 s later (minus latency):
    f.fromWorklet({ type: 'position', gen: 1, sample: 2 * SR, frame: 4800 });
    f.ctx.currentTime = 0.1 + 0.5 + 0.025;
    expect(p.now()).toBe(2.5 * S);
    // With an output timestamp, it is the truth.
    f.ctx.getOutputTimestamp = () => ({ contextTime: 0.1 + 0.25, performanceTime: 1 });
    expect(p.now()).toBe(2.25 * S);
    // A stale generation's position is ignored after a seek.
    p.seek(5 * S);
    f.fromWorklet({ type: 'position', gen: 1, sample: 0, frame: 0 });
    expect(p.now()).toBe(5 * S);
  });

  it('MOD-Audio the end of the project pauses playback at the end and calls onEnded', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    const ended = vi.fn();
    p.onEnded = ended;
    await p.play(0);
    f.fromWorklet({ type: 'ended', gen: 1, sample: 3 * SR });
    expect(ended).toHaveBeenCalledOnce();
    expect(p.state).toBe('paused');
    expect(p.now()).toBe(3 * S);
  });

  it('MOD-Audio a resume() that never settles is waited for at most 2 s; state is the truth', async () => {
    const f = fakeEnv();
    f.ctx.resumeSettles = false;
    const waiting = boundedResume(f.ctx, f.env);
    expect(f.timers.length).toBe(1);
    f.timers[0]!();
    expect(await waiting).toBe(false);
    f.ctx.state = 'running';
    expect(await boundedResume(f.ctx, f.env)).toBe(true);
  });

  it('MOD-Audio an interruption that a bounded resume cannot undo pauses playback (Play resumes it)', async () => {
    const f = fakeEnv();
    const p = new Playback(f.worker, '/w.js', f.env);
    const interrupted = vi.fn();
    p.onInterrupted = interrupted;
    await p.play(0);
    f.ctx.resumeSettles = false;
    f.ctx.state = 'interrupted';
    f.ctx.statechange();
    f.timers.at(-1)!();
    await flush();
    expect(interrupted).toHaveBeenCalledOnce();
    expect(p.state).toBe('paused');
    expect(f.toWorker.at(-1)?.type).toBe('audio:pause');
    // Page return while paused does nothing; a new Play asks the context to resume again.
    f.pageReturn();
    f.ctx.resumeSettles = true;
    await p.play(0);
    expect(f.ctx.state).toBe('running');
    expect(p.state).toBe('playing');
  });
});
