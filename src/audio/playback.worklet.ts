// MOD-Audio — the AudioWorkletProcessor (ADR-0003 §3, ADR-0008 §5 and outcome rule 6). Plays the
// 48 kHz stereo blocks the audio worker sends over a MessagePort (no SharedArrayBuffer), reports the
// project sample it is playing against the context frame (the master clock the preview follows) and
// counts underruns and the queue's low-water mark. Promoted from spike/audio (player-worklet.js).
// Implements: F-002.R2 (sound with picture: the clock), NFR-08 (the picture follows the sound).
import type { FromWorkletNode, FromWorkletToWorker, ToWorklet, ToWorkletNode } from './protocol';
import { PROCESSOR_NAME } from './protocol';

// The worklet global scope is not in the DOM library, so its names are declared here.
declare const registerProcessor: (name: string, ctor: new () => AudioWorkletProcessor) => void;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** Samples hashed after each flush (tests compare the played sound with an export render). */
const HASH_LIMIT = 30 * 48_000;
/** Quanta between position and played reports (≈ 21 ms). */
const REPORT_EVERY = 8;

type Block = { from: number; L: Float32Array; R: Float32Array };

class PlaybackProcessor extends AudioWorkletProcessor {
  private worker: MessagePort | null = null;
  private gen = -1;
  private queue: Block[] = [];
  private cur: Block | null = null;
  private off = 0;
  private queued = 0;
  /** Samples of this generation played. */
  private played = 0;
  /** Project sample the next output sample plays. */
  private sample = 0;
  private endAt = -1;
  private endedSent = false;
  private quanta = 0;
  private started = false;
  private underQuanta = 0;
  private underEvents = 0;
  private inUnder = false;
  private lowWater = Infinity;
  private hL = 0x811c9dc5;
  private hR = 0x811c9dc5;
  private hashed = 0;
  private reportNow = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ToWorkletNode>) => {
      const d = e.data;
      if (d.type === 'connect') {
        this.worker = d.port;
        this.worker.onmessage = (m: MessageEvent<ToWorklet>) => this.onWorker(m.data);
        this.worker.start();
      } else if (d.type === 'stats') this.postStats();
    };
  }

  private onWorker(d: ToWorklet): void {
    if (d.type === 'flush') {
      this.gen = d.gen;
      this.queue = [];
      this.cur = null;
      this.queued = 0;
      this.played = 0;
      this.sample = d.from;
      this.endAt = -1;
      this.endedSent = false;
      this.started = false;
      this.inUnder = false;
      this.hL = 0x811c9dc5;
      this.hR = 0x811c9dc5;
      this.hashed = 0;
      this.reportNow = true;
      return;
    }
    if (d.gen !== this.gen) return; // an older generation: flushed
    if (d.type === 'end') {
      this.endAt = d.at;
      return;
    }
    this.queue.push({ from: d.from, L: d.L, R: d.R });
    this.queued += d.L.length;
    this.started = true;
  }

  private hash(L: Float32Array, R: Float32Array, at: number, n: number): void {
    const m = Math.min(n, HASH_LIMIT - this.hashed);
    if (m <= 0) return;
    const bl = new Uint8Array(L.buffer, L.byteOffset + at * 4, m * 4);
    const br = new Uint8Array(R.buffer, R.byteOffset + at * 4, m * 4);
    let hl = this.hL;
    let hr = this.hR;
    for (let i = 0; i < bl.length; i++) {
      hl = Math.imul(hl ^ bl[i]!, 0x01000193);
      hr = Math.imul(hr ^ br[i]!, 0x01000193);
    }
    this.hL = hl;
    this.hR = hr;
    this.hashed += m;
  }

  private postStats(): void {
    const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0');
    const msg: FromWorkletNode = {
      type: 'stats',
      stats: {
        underrunQuanta: this.underQuanta,
        underrunEvents: this.underEvents,
        lowWater: Number.isFinite(this.lowWater) ? this.lowWater : -1,
        played: this.played,
        hashL: hex(this.hL),
        hashR: hex(this.hR),
        hashed: this.hashed,
      },
    };
    this.port.postMessage(msg);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out?.[0];
    if (!out || !L) return true;
    const R = out[1] ?? L;
    const n = L.length;
    const startSample = this.sample;
    let i = 0;
    while (i < n) {
      if (!this.cur) {
        this.cur = this.queue.shift() ?? null;
        this.off = 0;
        if (!this.cur) break;
      }
      const take = Math.min(n - i, this.cur.L.length - this.off);
      L.set(this.cur.L.subarray(this.off, this.off + take), i);
      R.set(this.cur.R.subarray(this.off, this.off + take), i);
      this.hash(this.cur.L, this.cur.R, this.off, take);
      i += take;
      this.off += take;
      this.queued -= take;
      if (this.off >= this.cur.L.length) this.cur = null;
    }
    if (i < n) {
      L.fill(0, i);
      if (R !== L) R.fill(0, i);
    }
    this.played += i;
    this.sample += i;
    this.quanta++;
    const ending = this.endAt >= 0 && this.sample >= this.endAt;
    if (this.started && !ending) {
      if (i < n) {
        this.underQuanta++;
        if (!this.inUnder) this.underEvents++;
        this.inUnder = true;
      } else this.inUnder = false;
      if (this.queued < this.lowWater) this.lowWater = this.queued;
    }
    if (this.gen >= 0 && (this.reportNow || this.quanta % REPORT_EVERY === 0)) {
      this.reportNow = false;
      const pos: FromWorkletNode = { type: 'position', gen: this.gen, sample: startSample, frame: currentFrame };
      this.port.postMessage(pos);
      const played: FromWorkletToWorker = { type: 'played', gen: this.gen, played: this.played };
      this.worker?.postMessage(played);
    }
    if (ending && !this.endedSent && !this.cur && this.queue.length === 0) {
      this.endedSent = true;
      const ended: FromWorkletNode = { type: 'ended', gen: this.gen, sample: this.endAt };
      this.port.postMessage(ended);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PlaybackProcessor);
