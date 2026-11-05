// MOD-Export — the mux schedule: sound that arrives after the video without holding video in memory
// (ADR-0010 outcome item 1; architecture.md risk 5, G3 risk 3). The writer (mediabunny) interleaves
// tracks by time and queues every sample in memory until each track has one, so feeding it all the video
// before the sound would hold the encoded video in memory. Instead, while the verified sound is not there
// yet, encoded video packets go to a spill store (a second scratch file; only their times and offsets stay
// in memory). When the sound arrives (≤ 14 MB for 10 min, which may be held), the spilled video is
// replayed and both tracks are fed in time order, so the writer never queues more than one sound packet's
// worth of video; later video goes straight through.
// Implements: ADR-0010 §1 and outcome item 1, NFR-05 (memory flat).
import type { MediaWriter, OutPacket } from '../container';

/** Where encoded video waits for the sound: `append` returns the offset. */
export interface SpillStore {
  append(data: Uint8Array): number;
  read(offset: number, length: number): Uint8Array;
  readonly bytes: number;
  discard(): void | Promise<void>;
}

/** A spill store in memory (only with the memory sink, where the whole file is in memory anyway). */
export class MemorySpill implements SpillStore {
  private parts = new Map<number, Uint8Array>();
  bytes = 0;
  append(data: Uint8Array): number {
    const at = this.bytes;
    this.parts.set(at, data.slice());
    this.bytes += data.length;
    return at;
  }
  read(offset: number, length: number): Uint8Array {
    const part = this.parts.get(offset);
    if (!part || part.length !== length) throw new Error(`spill: no packet of ${length} bytes at ${offset}`);
    this.parts.delete(offset);
    return part;
  }
  discard(): void {
    this.parts.clear();
  }
}

type Writer = Pick<MediaWriter, 'addVideo' | 'addAudio'>;

interface Spilled {
  readonly timestamp: number;
  readonly duration: number;
  readonly key: boolean;
  readonly offset: number;
  readonly length: number;
}

export class LateAudioMux {
  private spill: SpillStore | null = null;
  private spilled: Spilled[] = [];
  private audio: readonly OutPacket[] | null = null;
  private audioConfig: AudioDecoderConfig | undefined;
  private audioAt = 0;
  private videoConfig: VideoDecoderConfig | undefined;
  private videoWritten = false;
  private chain: Promise<void> = Promise.resolve();
  /** Encoded video held in this stage's memory at once (stays one packet: the one being written). */
  heldVideoBytesMax = 0;
  spilledBytes = 0;
  /** Order of writes (tests and the integration check): 'v' or 'a' with the packet time. */
  readonly log: [kind: 'v' | 'a', t: number][] | null;

  constructor(
    private readonly writer: Writer,
    private readonly hasAudio: boolean,
    private readonly openSpill: () => SpillStore,
    options: { log?: boolean } = {},
  ) {
    this.log = options.log ? [] : null;
  }

  private run(f: () => Promise<void>): Promise<void> {
    const next = this.chain.then(f);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** A video packet in decode order; `config` with the first (decoder config + colour tags). */
  video(p: OutPacket, config?: VideoDecoderConfig): Promise<void> {
    if (config && !this.videoConfig) this.videoConfig = config;
    return this.run(async () => {
      if (this.hasAudio && !this.audio) {
        this.spill ??= this.openSpill();
        const offset = this.spill.append(p.data);
        this.spilled.push({ timestamp: p.timestamp, duration: p.duration, key: p.key, offset, length: p.data.length });
        this.spilledBytes += p.data.length;
        return;
      }
      await this.writeVideo(p);
    });
  }

  /** The verified sound, all packets (times already shifted by the encoder delay). */
  audioReady(packets: readonly OutPacket[], config: AudioDecoderConfig): Promise<void> {
    return this.run(async () => {
      this.audio = [...packets].sort((a, b) => a.timestamp - b.timestamp);
      this.audioConfig = config;
      const spilled = this.spilled;
      this.spilled = [];
      for (const s of spilled) {
        const data = this.spill!.read(s.offset, s.length);
        await this.writeVideo({ data, timestamp: s.timestamp, duration: s.duration, key: s.key });
      }
      if (this.spill) await this.spill.discard();
      this.spill = null;
    });
  }

  get waitingForAudio(): boolean {
    return this.hasAudio && !this.audio;
  }

  /** After the last video packet and the sound: the rest of the sound. */
  finish(): Promise<void> {
    return this.run(async () => {
      if (this.hasAudio && !this.audio) throw new Error('mux: the sound never arrived');
      await this.audioUpTo(Infinity);
    });
  }

  /** Drops the spill (cancel / failure). */
  async discard(): Promise<void> {
    await this.spill?.discard();
    this.spill = null;
    this.spilled = [];
  }

  private async audioUpTo(t: number): Promise<void> {
    const a = this.audio;
    if (!a) return;
    while (this.audioAt < a.length && a[this.audioAt]!.timestamp <= t) {
      const p = a[this.audioAt]!;
      await this.writer.addAudio(p, this.audioAt === 0 ? this.audioConfig : undefined);
      this.log?.push(['a', p.timestamp]);
      this.audioAt++;
    }
  }

  private async writeVideo(p: OutPacket): Promise<void> {
    this.heldVideoBytesMax = Math.max(this.heldVideoBytesMax, p.data.length);
    await this.audioUpTo(p.timestamp);
    await this.writer.addVideo(p, this.videoWritten ? undefined : this.videoConfig);
    this.videoWritten = true;
    this.log?.push(['v', p.timestamp]);
  }
}
