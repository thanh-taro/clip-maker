// MOD-Audio — the audio worker's streaming state (ADR-0008 §5 and outcome rule 6), kept apart from
// the worker scope so it runs in Node tests with a fake port. Renders with the export's Mixer and keeps
// PLAYBACK_LEAD samples queued ahead of what the worklet has played; a seek flushes the queue (new
// generation) and re-renders from the new position with the limiter's 1 s pre-roll.
// With windowed decoding (ADR-0008 §6) it also tells the decoder what to keep (`want`: the 1 s pre-roll
// behind, the queued lead and ≈ 2 s ahead) and renders a block only once the sound it reads is decoded
// (`ready`), so play starts when picture and sound can start together (F-002.R2): until the first block
// arrives the worklet's clock does not move. A source whose decode stalls is not waited for longer than
// STALL_MS (it is heard as silence for that block).
import { layoutOf, type Micros, type Project } from '../core';
import { SAMPLE_RATE, voices, type Voice } from '../plan';
import { DECODE_AHEAD } from './decode';
import { soundDemand, type Demand } from './demand';
import { LIMITER_PREROLL, Mixer } from './mixer';
import { PLAYBACK_BLOCK, PLAYBACK_LEAD, type FromWorkletToWorker, type ToWorklet } from './protocol';
import type { SourceBank } from './source';

/** More than the limiter's latency: the raw mix runs this far ahead of the output. */
export const MIX_LATENCY_MARGIN = 1024;
/** The longest a block waits for its sound to be decoded. */
export const STALL_MS = 1500;

/** The windowed decoder as the streamer drives it (MOD-Audio SoundBank). */
export interface StreamSound {
  want(demand: readonly Demand[]): void;
  ready(demand: readonly Demand[]): boolean;
}

export interface StreamTimers {
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/** The 48 kHz sample at a project time (rounded). */
export const sampleAt = (t: Micros): number => Math.round((t * SAMPLE_RATE) / 1_000_000);

/** The project end as a 48 kHz sample (whole frames; 48 000 is a multiple of every project rate). */
export function endSampleOf(project: Project): number {
  return (layoutOf(project).frames * SAMPLE_RATE) / project.frame.frameRate;
}

/** The part of a MessagePort the streamer uses. */
export interface PortLike {
  postMessage(message: ToWorklet, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<FromWorkletToWorker>) => void) | null;
  start?(): void;
}

export class Streamer {
  private port: PortLike | null = null;
  private voices: readonly Voice[] = [];
  private endSample = 0;
  private mixer: Mixer | null = null;
  private gen = -1;
  private playing = false;
  /** Project sample of the last flush; produced/consumed count from it. */
  private from = 0;
  private produced = 0;
  private consumed = 0;
  private endSent = false;
  private stall: unknown = null;
  private forced = false;
  /** Blocks rendered (instrumentation). */
  blocks = 0;
  /** Times a block waited for decoding, and blocks rendered after STALL_MS without it (instrumentation). */
  waits = 0;
  stalls = 0;

  constructor(
    private readonly sources: SourceBank,
    private readonly lead: number = PLAYBACK_LEAD,
    private readonly block: number = PLAYBACK_BLOCK,
    private readonly sound: StreamSound | null = null,
    private readonly timers: StreamTimers = {
      setTimeout: (f, ms) => setTimeout(f, ms),
      clearTimeout: (id) => clearTimeout(id as number),
    },
  ) {}

  connect(port: PortLike): void {
    this.port = port;
    port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'played' && d.gen === this.gen) {
        this.consumed = d.played;
        this.fill();
      }
    };
    port.start?.();
  }

  setProject(project: Project): void {
    this.voices = voices(project);
    this.endSample = endSampleOf(project);
    this.remix();
  }

  /** New decoded sound given whole (`audio:pcm`): the samples not yet queued are rendered with it. */
  sourcesChanged(): void {
    this.remix();
  }

  /** The windowed decoder made progress: a block waiting for it may render now. */
  decoded(): void {
    if (this.stall !== null) this.fill();
  }

  play(t: Micros, gen: number): void {
    this.gen = gen;
    this.playing = true;
    this.from = sampleAt(t);
    this.produced = 0;
    this.consumed = 0;
    this.endSent = false;
    this.mixer = null;
    this.port?.postMessage({ type: 'flush', gen, from: this.from });
    this.fill();
  }

  pause(gen: number): void {
    this.gen = gen;
    this.playing = false;
    this.mixer = null;
    this.unstall();
    this.from += this.consumed;
    this.produced = this.consumed = 0;
    this.port?.postMessage({ type: 'flush', gen, from: this.from });
    this.prewarm();
  }

  seek(t: Micros, gen: number): void {
    if (this.playing) this.play(t, gen);
    else {
      this.gen = gen;
      this.from = sampleAt(t);
      this.produced = this.consumed = 0;
      this.prewarm();
    }
  }

  /** Paused: the sound at the playhead is decoded now, so Play starts at once. */
  private prewarm(): void {
    this.sound?.want(this.demand(this.from - LIMITER_PREROLL, this.from + this.lead + DECODE_AHEAD));
  }

  private demand(from: number, to: number): Demand[] {
    return soundDemand(this.voices, from - MIX_LATENCY_MARGIN, to + MIX_LATENCY_MARGIN);
  }

  /** Whether the sound of mix samples [from, to) is decoded; if not, waits (at most STALL_MS). */
  private decodedFor(from: number, to: number): boolean {
    if (!this.sound || this.forced || this.sound.ready(this.demand(from, to))) {
      this.unstall();
      return true;
    }
    if (this.stall === null) {
      this.waits++;
      this.stall = this.timers.setTimeout(() => {
        this.stall = null;
        this.stalls++;
        this.forced = true;
        this.fill();
        this.forced = false;
      }, STALL_MS);
    }
    return false;
  }

  private unstall(): void {
    if (this.stall !== null) this.timers.clearTimeout(this.stall);
    this.stall = null;
  }

  /** Re-creates the mixer at the next sample to queue (edits are heard after the queued lead). */
  private remix(): void {
    if (!this.playing) return this.prewarm();
    this.mixer = null;
    this.endSent = false;
    this.fill();
  }

  private fill(): void {
    const port = this.port;
    if (!port || !this.playing) return;
    const next = this.from + this.produced;
    this.sound?.want(this.demand(next - LIMITER_PREROLL, this.from + this.consumed + this.lead + DECODE_AHEAD));
    if (!this.mixer) {
      // A new mixer pre-rolls the limiter over the second before (ADR-0008 §5): that sound too.
      if (next < this.endSample && !this.decodedFor(next - LIMITER_PREROLL, next + this.block)) return;
      this.mixer = new Mixer(this.voices, this.sources, this.endSample);
      this.mixer.seek(next);
    }
    const mixer = this.mixer;
    while (this.produced - this.consumed < this.lead) {
      const at = this.from + this.produced;
      const n = Math.min(this.block, this.endSample - at);
      if (n > 0 && !this.decodedFor(at, at + n)) return;
      if (n <= 0) {
        if (!this.endSent) {
          this.endSent = true;
          port.postMessage({ type: 'end', gen: this.gen, at: Math.max(at, this.from) });
        }
        return;
      }
      const L = new Float32Array(n);
      const R = new Float32Array(n);
      mixer.process(L, R);
      port.postMessage({ type: 'block', gen: this.gen, from: at, L, R }, [L.buffer, R.buffer]);
      this.produced += n;
      this.blocks++;
    }
  }
}
