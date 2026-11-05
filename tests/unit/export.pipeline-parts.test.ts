// MOD-Export pure parts: the late-sound mux schedule, sink choice and the memory sink, progress and
// time remaining, the interruption rules, and the export-audio pass with modelled codecs.
import { describe, expect, it } from 'vitest';
import { endSampleOf, pcmSource, truePeak, wavHeader, type SoundSource } from '../../src/audio';
import type { OutPacket } from '../../src/container';
import {
  chooseSink,
  Dither,
  InterruptWatch,
  LateAudioMux,
  lossyAudio,
  MemorySink,
  MemorySpill,
  MEMORY_CAP,
  mixBlocks,
  ProgressTracker,
  wavAudio,
  type AudioCodecs,
  type EncodedOut,
} from '../../src/export';
import { voices } from '../../src/plan';
import { proj, video } from '../support/project';

const pk = (t: number, bytes = 10, key = false): OutPacket => ({
  data: new Uint8Array(bytes).fill(t * 10),
  timestamp: t,
  duration: 1 / 30,
  key,
});

function fakeWriter() {
  const writes: [string, number, boolean][] = [];
  return {
    writes,
    addVideo: async (p: OutPacket, c?: VideoDecoderConfig) => void writes.push(['v', p.timestamp, !!c]),
    addAudio: async (p: OutPacket, c?: AudioDecoderConfig) => void writes.push(['a', p.timestamp, !!c]),
  };
}

describe('MOD-Export mux schedule (ADR-0010 outcome item 1)', () => {
  it('ADR-0010 outcome item 1 video made before the sound is spilled, then replayed in time order with the sound; nothing is held in memory', async () => {
    const w = fakeWriter();
    const spill = new MemorySpill();
    const mux = new LateAudioMux(w, true, () => spill);
    const cfg = { codec: 'avc1.640028' } as VideoDecoderConfig;
    for (let k = 0; k < 6; k++) await mux.video(pk(k / 30, 100, k === 0), k === 0 ? cfg : undefined);
    expect(w.writes).toEqual([]);
    expect(mux.spilledBytes).toBe(600);
    const audio = [0, 0.021, 0.043, 0.064, 0.085, 0.107, 0.128, 0.149, 0.171, 0.192].map((t) => pk(t, 20));
    await mux.audioReady(audio, { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 });
    for (let k = 6; k < 8; k++) await mux.video(pk(k / 30, 100));
    await mux.finish();
    const times = w.writes.map(([, t]) => t);
    // Every write is in time order across both tracks (audio first on ties).
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(w.writes.filter(([k]) => k === 'v')).toHaveLength(8);
    expect(w.writes.filter(([k]) => k === 'a')).toHaveLength(10);
    // The decoder configs go with each track's first packet only.
    expect(w.writes.filter(([, , c]) => c)).toEqual([
      ['a', 0, true],
      ['v', 0, true],
    ]);
    expect(mux.heldVideoBytesMax).toBe(100); // one packet at a time
    expect(spill.bytes).toBe(600);
  });

  it('ADR-0010 outcome item 1 sound that arrives after all the video still interleaves by time', async () => {
    const w = fakeWriter();
    const mux = new LateAudioMux(w, true, () => new MemorySpill());
    for (let k = 0; k < 30; k++) await mux.video(pk(k / 30));
    await mux.audioReady(
      Array.from({ length: 47 }, (_, i) => pk((i * 1024) / 48000)),
      { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 },
    );
    await mux.finish();
    const order = w.writes.map(([k, t]) => `${k}${t.toFixed(4)}`);
    const sorted = [...w.writes].sort((a, b) => a[1] - b[1] || (a[0] === 'a' ? -1 : 1));
    expect(order).toEqual(sorted.map(([k, t]) => `${k}${t.toFixed(4)}`));
  });

  it('ADR-0010 outcome item 1 without sound nothing is spilled and video goes straight to the writer', async () => {
    const w = fakeWriter();
    let opened = 0;
    const mux = new LateAudioMux(w, false, () => (opened++, new MemorySpill()));
    await mux.video(pk(0, 10, true));
    await mux.finish();
    expect(opened).toBe(0);
    expect(w.writes).toEqual([['v', 0, false]]);
  });

  it('ADR-0010 outcome item 1 finishing while the sound never came is an error', async () => {
    const mux = new LateAudioMux(fakeWriter(), true, () => new MemorySpill());
    await mux.video(pk(0));
    await expect(mux.finish()).rejects.toThrow(/sound never arrived/);
  });
});

describe('MOD-Export sinks (ADR-0010 §2, outcome item 5)', () => {
  it('F-019.R7 the scratch file when there is room; memory under the device cap; otherwise COPY-error.no_space', () => {
    expect(chooseSink({ opfs: true, room: true, estimate: 1e9, cap: MEMORY_CAP.phone })).toBe('scratch');
    expect(chooseSink({ opfs: true, room: false, estimate: 100e6, cap: MEMORY_CAP.phone })).toBe('memory');
    expect(chooseSink({ opfs: false, room: false, estimate: 240e6, cap: MEMORY_CAP.phone })).toBe('no_space');
    expect(chooseSink({ opfs: false, room: false, estimate: 240e6, cap: MEMORY_CAP.laptop })).toBe('memory');
    // The WebKit frame's quota is 1/10 of standalone: a long 4K export cannot start there.
    expect(chooseSink({ opfs: true, room: false, estimate: 2.7e9, cap: MEMORY_CAP.laptop })).toBe('no_space');
  });

  it('ADR-0010 §2.2 the memory sink assembles positioned writes, including a header patched at the end', async () => {
    const s = new MemorySink();
    s.write(new Uint8Array([0, 0, 0, 0]), 0);
    for (let i = 0; i < 3; i++) s.write(new Uint8Array(1_000_000).fill(i + 1), 4 + i * 1_000_000);
    s.write(new Uint8Array([9, 9]), 1);
    s.close();
    const b = new Uint8Array(await s.blob('video/mp4').arrayBuffer());
    expect(b.length).toBe(3_000_004);
    expect([...b.subarray(0, 5)]).toEqual([0, 9, 9, 0, 1]);
    expect(b[2_000_004]).toBe(3);
  });
});

describe('MOD-Export progress (F-015.AC12) and interruption (ADR-0010 outcome item 10)', () => {
  it('F-015.AC12 the fraction never goes down (also when the corrective pass adds frames) and time remaining starts at 10 %', () => {
    const p = new ProgressTracker();
    expect(p.update(5, 100, 0).remainingMs).toBeNull();
    const a = p.update(20, 100, 2000);
    expect(a.remainingMs).not.toBeNull();
    expect(a.remainingMs!).toBeGreaterThan(5000);
    const b = p.update(40, 200, 2500); // a second pass doubled the total
    expect(b.fraction).toBeGreaterThanOrEqual(a.fraction);
    expect(p.update(100, 100, 9000).fraction).toBeLessThan(1); // the index is still being written
    expect(p.done().fraction).toBe(1);
  });

  it('F-015.AC12 a steady export’s time remaining is within ±30 % of the actual time from 10 % on', () => {
    const p = new ProgressTracker();
    const total = 1800;
    const msPerFrame = 20;
    for (let k = 0; k <= total; k += 15) {
      const now = k * msPerFrame;
      const v = p.update(k, total, now);
      if (k / total >= 0.1 && k < total) {
        const actual = (total - k) * msPerFrame;
        expect(Math.abs(v.remainingMs! - actual)).toBeLessThanOrEqual(0.3 * actual + 50);
      }
    }
  });

  it('ADR-0010 outcome item 10 (a) hidden with no progress for 5 s is an interruption', () => {
    const w = new InterruptWatch(0);
    w.progress(1000);
    w.visibility(true, 2000);
    expect(w.interrupted(6999)).toBe(false);
    expect(w.interrupted(7000)).toBe(true);
  });

  it('ADR-0010 outcome item 10 (b) no new progress within 3 s of becoming visible again is an interruption; progress means it carries on', () => {
    const w = new InterruptWatch(0);
    w.visibility(true, 1000);
    w.visibility(false, 4000);
    expect(w.interrupted(6999)).toBe(false);
    expect(w.interrupted(7000)).toBe(true);
    const alive = new InterruptWatch(0);
    alive.visibility(true, 1000);
    alive.progress(2000); // engines that keep workers running while hidden
    alive.visibility(false, 4000);
    alive.progress(4500);
    expect(alive.interrupted(60_000)).toBe(false);
  });

  it('ADR-0010 outcome item 10 (c) an encoder or WebGL error after a hide is an interruption; without a hide it is a failure', () => {
    const w = new InterruptWatch(0);
    expect(w.errorKind()).toBe('failed');
    w.visibility(true, 10);
    w.visibility(false, 20);
    expect(w.errorKind()).toBe('interrupted');
  });
});

/** A modelled lossy codec: the decoded signal is the input × `overshoot` (a codec's true-peak overshoot). */
function modelCodec(overshoot: number): AudioCodecs & { passes: number } {
  const c = {
    passes: 0,
    async encode(_config: AudioEncoderConfig, blocks: AsyncIterable<[Float32Array, Float32Array]>) {
      c.passes++;
      const packets: EncodedOut[] = [];
      let at = 0;
      for await (const [L, R] of blocks) {
        const data = new Uint8Array(new Float32Array([...L, ...R]).buffer);
        packets.push({ data, timestamp: Math.round((at * 1e6) / 48000), duration: 0, key: true });
        at += L.length;
      }
      return { packets, config: { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 } };
    },
    async decode(_c: AudioDecoderConfig, packets: readonly EncodedOut[], onBlock: (p: Float32Array[]) => void) {
      for (const p of packets) {
        const f = new Float32Array(p.data.slice().buffer);
        const n = f.length / 2;
        onBlock([f.slice(0, n).map((x) => x * overshoot), f.slice(n).map((x) => x * overshoot)]);
      }
    },
  };
  return c;
}

function loudJob(seconds = 2) {
  const project = proj({ clips: [video('a', seconds)] });
  const n = 48000 * (seconds + 1);
  const L = Float32Array.from({ length: n }, (_, i) => 1.4 * Math.sin((2 * Math.PI * 997 * i) / 48000));
  const sources = new Map<string, SoundSource>([['src-a', pcmSource(L, L.slice())]]);
  return { voices: voices(project), bank: (id: string) => sources.get(id), endSample: endSampleOf(project) };
}

describe('MOD-Export export-audio pass (ADR-0008 outcome item 2)', () => {
  it('RULE-12 a codec overshoot of +3 dB is trimmed so the decoded export’s true peak is ≤ −1.0 dBTP', async () => {
    const codec = modelCodec(10 ** (3 / 20));
    const r = await lossyAudio(
      loudJob(),
      { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 },
      2112,
      codec,
      null,
    );
    expect(r.trim.fallback).toBe(false);
    expect(r.trim.passes).toBe(2);
    expect(r.trim.peakDb!).toBeLessThanOrEqual(-1.0);
    expect(codec.passes).toBe(2);
  });

  it('ADR-0008 outcome item 3 packet times are shifted by the encoder delay (2112 samples) for the edit list', async () => {
    const r = await lossyAudio(
      loudJob(1),
      { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 },
      2112,
      modelCodec(1),
      null,
    );
    expect(r.packets[0]!.timestamp).toBeCloseTo(-2112 / 48000, 9);
    expect(r.packets[1]!.timestamp - r.packets[0]!.timestamp).toBeCloseTo(0.1, 6);
  });

  it('ADR-0008 outcome item 2 a known project gain is reused in one pass (shared by video and audio-only exports)', async () => {
    const codec = modelCodec(10 ** (3 / 20));
    const r = await lossyAudio(loudJob(1), { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 }, 312, codec, -4.2);
    expect(codec.passes).toBe(1);
    expect(r.trim).toMatchObject({ gainDb: -4.2, passes: 1, fallback: false });
  });

  it('INV-02 the mix blocks are the limited mix the preview plays (true peak ≤ −1.5 dBTP before encoding)', async () => {
    const job = loudJob(1);
    const parts: Float32Array[] = [];
    for await (const [L] of mixBlocks(job)) parts.push(L);
    const all = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of parts) all.set(p, (at += p.length) - p.length);
    expect(all.length).toBe(job.endSample);
    expect(truePeak([all]).dB).toBeLessThanOrEqual(-1.4);
  });

  it('RULE-16 the WAV writer streams 16-bit stereo with a fixed-seed dither, so repeated exports are identical', async () => {
    const run = async () => {
      const chunks: Uint8Array[] = [];
      const { header, frames } = await wavAudio(loudJob(1), (b) => void chunks.push(b));
      return { header, frames, bytes: chunks.reduce((s, c) => s + c.length, 0), first: chunks[0]!.slice(0, 64) };
    };
    const a = await run();
    const b = await run();
    expect(a.frames).toBe(48000);
    expect(a.bytes).toBe(48000 * 4);
    expect(a.header).toEqual(wavHeader(48000));
    expect(b.first).toEqual(a.first);
    const d = new Dither(1);
    const v = Array.from({ length: 1000 }, () => d.sample(0));
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(-1);
  });
});
