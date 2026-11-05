// MOD-Audio — the audio worker's streaming state (ADR-0008 §5 and outcome rule 6), kept apart from
// the worker scope so it runs in Node tests with a fake port. Renders with the export's Mixer and keeps
// PLAYBACK_LEAD samples queued ahead of what the worklet has played; a seek flushes the queue (new
// generation) and re-renders from the new position with the limiter's 1 s pre-roll.
import { layoutOf, type Micros, type Project } from '../core';
import { SAMPLE_RATE, voices, type Voice } from '../plan';
import { Mixer } from './mixer';
import { PLAYBACK_BLOCK, PLAYBACK_LEAD, type FromWorkletToWorker, type ToWorklet } from './protocol';
import type { SourceBank } from './source';

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
  /** Blocks rendered (instrumentation). */
  blocks = 0;

  constructor(
    private readonly sources: SourceBank,
    private readonly lead: number = PLAYBACK_LEAD,
    private readonly block: number = PLAYBACK_BLOCK,
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

  /** New decoded sound: the samples not yet queued are rendered with it. */
  sourcesChanged(): void {
    this.remix();
  }

  play(t: Micros, gen: number): void {
    this.gen = gen;
    this.playing = true;
    this.from = sampleAt(t);
    this.produced = 0;
    this.consumed = 0;
    this.endSent = false;
    this.mixer = new Mixer(this.voices, this.sources, this.endSample);
    this.mixer.seek(this.from);
    this.port?.postMessage({ type: 'flush', gen, from: this.from });
    this.fill();
  }

  pause(gen: number): void {
    this.gen = gen;
    this.playing = false;
    this.mixer = null;
    this.port?.postMessage({ type: 'flush', gen, from: this.from + this.consumed });
  }

  seek(t: Micros, gen: number): void {
    if (this.playing) this.play(t, gen);
    else {
      this.gen = gen;
      this.from = sampleAt(t);
      this.produced = this.consumed = 0;
    }
  }

  /** Re-creates the mixer at the next sample to queue (edits are heard after the queued lead). */
  private remix(): void {
    if (!this.playing) return;
    const at = this.from + this.produced;
    this.mixer = new Mixer(this.voices, this.sources, this.endSample);
    this.mixer.seek(at);
    this.endSent = false;
    this.fill();
  }

  private fill(): void {
    const port = this.port;
    const mixer = this.mixer;
    if (!port || !mixer || !this.playing) return;
    while (this.produced - this.consumed < this.lead) {
      const at = this.from + this.produced;
      const n = Math.min(this.block, this.endSample - at);
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
