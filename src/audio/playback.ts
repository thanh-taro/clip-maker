// MOD-Audio — the main-thread side of playback (ADR-0008 §5, outcome rules 6–8; platform-mapping
// "Picture and sound together"): the AudioContext created in the first user gesture (after
// `navigator.audioSession.type = 'playback'` where present, D-046), the worklet node, the channel
// between the audio worker and the worklet, bounded `resume()` waits, and the master clock the preview
// follows. The browser objects are injected so Node tests can drive it with fakes.
// Implements: F-002.R2 (sound with picture; the picture follows this clock), NFR-08.
import type { Micros } from '../core';
import { SAMPLE_RATE } from '../plan';
import {
  PROCESSOR_NAME,
  RESUME_TIMEOUT_MS,
  type FromWorkletNode,
  type ToAudioWorker,
  type ToWorkletNode,
  type WorkletStats,
} from './protocol';

/** The parts of an AudioContext playback uses. */
export interface ContextLike {
  readonly state: string;
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly outputLatency?: number;
  readonly baseLatency?: number;
  readonly audioWorklet: { addModule(url: string): Promise<void> };
  readonly destination: unknown;
  readonly getOutputTimestamp?: (() => { contextTime?: number; performanceTime?: number }) | undefined;
  resume(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface NodeLike {
  readonly port: {
    postMessage(m: ToWorkletNode, transfer?: Transferable[]): void;
    onmessage: ((e: MessageEvent<FromWorkletNode>) => void) | null;
  };
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface WorkerLike {
  postMessage(m: ToAudioWorker, transfer?: Transferable[]): void;
}

/** The browser objects playback needs (injected for tests). */
export interface AudioEnv {
  createContext(): ContextLike;
  createNode(ctx: ContextLike): NodeLike;
  createChannel(): { port1: MessagePort; port2: MessagePort };
  /** `navigator.audioSession` where the engine has it (WebKit, iOS 17+). */
  audioSession(): { type: string } | undefined;
  onPageReturn(fn: () => void): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  /** performance.now() in ms. */
  now(): number;
}

/** The real browser environment. */
export function browserEnv(): AudioEnv {
  return {
    createContext: () =>
      new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' }) as unknown as ContextLike,
    createNode: (ctx) =>
      new AudioWorkletNode(ctx as unknown as AudioContext, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      }) as unknown as NodeLike,
    createChannel: () => new MessageChannel(),
    audioSession: () => (navigator as Navigator & { audioSession?: { type: string } }).audioSession,
    onPageReturn: (fn) =>
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') fn();
      }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as number),
    now: () => performance.now(),
  };
}

/**
 * Waits at most `ms` for `resume()` (WebKit's sometimes never settles); the context's `state` is the
 * truth. Resolves whether it is running.
 */
export async function boundedResume(
  ctx: ContextLike,
  env: Pick<AudioEnv, 'setTimeout' | 'clearTimeout'>,
  ms = RESUME_TIMEOUT_MS,
): Promise<boolean> {
  if (ctx.state === 'running') return true;
  let timer: unknown;
  await Promise.race([
    ctx.resume().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = env.setTimeout(resolve, ms);
    }),
  ]);
  env.clearTimeout(timer);
  return ctx.state === 'running';
}

const toMicros = (sample: number): Micros => Math.round((sample * 1_000_000) / SAMPLE_RATE);

export type PlaybackState = 'idle' | 'playing' | 'paused';

export class Playback {
  state: PlaybackState = 'idle';
  /** Playback reached the project end. */
  onEnded: (() => void) | null = null;
  /** The context stopped (interruption, lock) and a bounded resume did not restart it: playback paused. */
  onInterrupted: (() => void) | null = null;
  /** The latest worklet statistics (underruns, low-water mark, played hash). */
  stats: WorkletStats | null = null;

  private ctx: ContextLike | null = null;
  private ready: Promise<void> | null = null;
  private node: NodeLike | null = null;
  private gen = 0;
  private position: Micros = 0;
  private last: { sample: number; frame: number } | null = null;

  constructor(
    private readonly worker: WorkerLike,
    private readonly workletUrl: string,
    private readonly env: AudioEnv = browserEnv(),
  ) {}

  /**
   * Call inside the first user gesture (and every Play): sets the playback audio session, creates
   * the 48 kHz context and asks it to resume without waiting; loads the worklet and wires the
   * worker ↔ worklet channel in the background.
   */
  unlock(): void {
    let ctx = this.ctx;
    const fresh = !ctx;
    if (!ctx) {
      const session = this.env.audioSession();
      if (session) session.type = 'playback'; // D-046: not muted by the iOS ring/silent switch
      ctx = this.env.createContext();
      this.ctx = ctx;
    }
    // Asked inside the gesture, never awaited (WebKit's resume() may never settle).
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (fresh) {
      const c = ctx;
      c.addEventListener('statechange', () => void this.checkRunning());
      this.env.onPageReturn(() => void this.checkRunning());
      this.ready = c.audioWorklet.addModule(this.workletUrl).then(() => this.wire(c));
    }
  }

  private wire(ctx: ContextLike): void {
    const node = this.env.createNode(ctx);
    const channel = this.env.createChannel();
    node.port.onmessage = (e) => this.onWorklet(e.data);
    node.port.postMessage({ type: 'connect', port: channel.port2 }, [channel.port2]);
    this.worker.postMessage({ type: 'audio:port', port: channel.port1 }, [channel.port1]);
    node.connect(ctx.destination);
    this.node = node;
  }

  private onWorklet(d: FromWorkletNode): void {
    if (d.type === 'stats') {
      this.stats = d.stats;
      return;
    }
    if (d.gen !== this.gen) return;
    if (this.state !== 'playing') return;
    if (d.type === 'position') this.last = { sample: d.sample, frame: d.frame };
    else if (d.type === 'ended') {
      this.position = toMicros(d.sample);
      this.state = 'paused';
      this.last = null;
      this.onEnded?.();
    }
  }

  /** Starts playing from project time `from`. Call inside the user's gesture. */
  async play(from: Micros): Promise<void> {
    this.unlock();
    this.gen++;
    const gen = this.gen;
    this.position = from;
    this.last = null;
    this.state = 'playing';
    await this.ready;
    if (gen !== this.gen) return; // paused or seeked meanwhile
    this.worker.postMessage({ type: 'audio:play', from, gen });
  }

  pause(): void {
    if (this.state === 'playing') this.position = this.now();
    if (this.state !== 'idle') this.state = 'paused';
    this.gen++;
    this.last = null;
    this.worker.postMessage({ type: 'audio:pause', gen: this.gen });
  }

  seek(t: Micros): void {
    this.gen++;
    this.position = t;
    this.last = null;
    this.worker.postMessage({ type: 'audio:seek', t, gen: this.gen });
  }

  /** Asks the worklet for its statistics (answered into `stats`). */
  requestStats(): void {
    this.node?.port.postMessage({ type: 'stats' });
  }

  /** The project time being heard now (the master clock; the picture follows it). */
  now(): Micros {
    const ctx = this.ctx;
    if (this.state !== 'playing' || !ctx || !this.last) return this.position;
    const heard = this.outputFrame(ctx);
    const sample = this.last.sample + (heard - this.last.frame);
    return Math.max(this.position, toMicros(sample));
  }

  /** The context frame reaching the speakers now: the output timestamp, else currentTime − latency. */
  private outputFrame(ctx: ContextLike): number {
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      const t = ts.contextTime + Math.max(0, this.env.now() - ts.performanceTime) / 1000;
      return Math.floor(t * ctx.sampleRate);
    }
    const t = ctx.currentTime - (ctx.outputLatency ?? 0) - (ctx.baseLatency ?? 0);
    return Math.floor(Math.max(0, t) * ctx.sampleRate);
  }

  /** On `statechange` away from running and on page return: a bounded resume, else pause. */
  private async checkRunning(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    if (this.state !== 'playing') return;
    const running = await boundedResume(ctx, this.env);
    if (!running && this.state === 'playing') {
      this.pause();
      this.onInterrupted?.();
    }
  }

  async dispose(): Promise<void> {
    this.node?.disconnect();
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.node = null;
    this.ready = null;
    this.state = 'idle';
  }
}
