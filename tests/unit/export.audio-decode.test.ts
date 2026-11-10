// MOD-Export — the export-audio worker's mix waits for decoded sound block by block (ADR-0008 §6 and
// outcome item 9; build question 33): `prepare` runs before each 100 ms block in mix order, a decode
// error fails the export, and the samples equal the same sound given whole.
import { describe, expect, it } from 'vitest';
import { endSampleOf, offlinePrepare, pcmSource, SoundBank } from '../../src/audio';
import {
  lossyAudio,
  MIX_BLOCK,
  wavAudio,
  type AudioCodecs,
  type EncodedOut,
  type MixJob,
} from '../../src/export/audio-pass';
import { voices } from '../../src/plan';
import { proj, video } from '../support/project';
import { fakeDecoders, fakeFeed, type FakeTrack } from '../support/sound-feed';

const SR = 48_000;
const track: FakeTrack = {
  rate: 44_100,
  frames: 1024,
  priming: 2112,
  length: 44_100 * 4,
  channels: 1,
  sample: (n) => (n < 0 ? 0.9 : Math.fround(0.3 * Math.sin(n * 0.05))),
};

function decodedJob(opts: Parameters<typeof fakeDecoders>[1] = {}): { job: MixJob; calls: [number, number][] } {
  const project = proj({ clips: [video('a', 3, { speedPct: 200 })] });
  const tracks = { 'src-a': track };
  const bank = new SoundBank(fakeFeed(tracks), fakeDecoders(tracks, opts));
  bank.setSources(['src-a']);
  const vs = voices(project);
  const calls: [number, number][] = [];
  const prepare = offlinePrepare(bank, vs, (m) => new Error(m));
  return {
    calls,
    job: {
      voices: vs,
      bank: bank.get,
      endSample: endSampleOf(project),
      prepare: (from, to) => {
        calls.push([from, to]);
        return prepare(from, to);
      },
    },
  };
}

describe('MOD-Export sound decoded for the mix (ADR-0008 §6)', () => {
  it('ADR-0008 §6 the mix waits for each 100 ms block’s decoded sound in order, and matches the sound given whole', async () => {
    const { job, calls } = decodedJob();
    const parts: Uint8Array[] = [];
    await wavAudio(job, (b) => parts.push(b));
    expect(calls[0]).toEqual([0, MIX_BLOCK]);
    for (let i = 1; i < calls.length; i++) expect(calls[i]![0]).toBe((i - 1) * MIX_BLOCK);
    // The same sound decoded whole first (what `pcm` gives), mixed the same way.
    const whole = decodedJob();
    const all = [{ sourceId: 'src-a', from: -SR, to: 5 * SR }];
    const bank = new SoundBank(fakeFeed({ 'src-a': track }), fakeDecoders({ 'src-a': track }));
    bank.setSources(['src-a']);
    bank.want(all);
    await bank.until(all);
    const [L, R] = [new Float32Array(5 * SR), new Float32Array(5 * SR)];
    bank.get('src-a')!.read(0, L, R);
    const given: Uint8Array[] = [];
    const { voices: vs, endSample } = whole.job;
    await wavAudio({ voices: vs, endSample, bank: () => pcmSource(L, R) }, (b) => given.push(b));
    const join = (p: Uint8Array[]) => p.map((b) => Array.from(b).join(',')).join(',');
    expect(join(parts)).toBe(join(given));
  });

  it('ADR-0008 §6 a decode error stops the mix with the error (the export fails, sound is never dropped)', async () => {
    const { job } = decodedJob({ failAfter: 30 });
    await expect(wavAudio(job, () => undefined)).rejects.toThrow(/src-a: .*EncodingError/);
  });

  it('ADR-0008 outcome item 2 every verify-and-trim pass mixes the decoded sound from the start (pass 2 is not silent)', async () => {
    const { job } = decodedJob();
    const passes: Float32Array[] = [];
    // A fake codec: "encodes" the mix as it is; the first decode measures loud, so the trim runs again.
    const codecs: AudioCodecs = {
      async encode(_config, blocks) {
        const parts: Float32Array[] = [];
        for await (const [L] of blocks) parts.push(L);
        const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
          all.set(p, at);
          at += p.length;
        }
        passes.push(all);
        const packet: EncodedOut = { data: new Uint8Array(1), timestamp: 0, duration: 0, key: true };
        return { packets: [packet], config: { codec: 'fake', sampleRate: SR, numberOfChannels: 2 } };
      },
      async decode(_config, _packets, onBlock) {
        const loud = passes.length === 1 ? 1.2 : 0.5;
        onBlock([new Float32Array([loud]), new Float32Array([loud])]);
      },
    };
    const r = await lossyAudio(job, { codec: 'fake', sampleRate: SR, numberOfChannels: 2 }, 0, codecs, null);
    expect(r.trim.passes).toBeGreaterThanOrEqual(2);
    expect(passes.length).toBeGreaterThanOrEqual(2);
    const ratio = 10 ** (r.trim.gainDb / 20);
    const [first, last] = [passes[0]!, passes.at(-1)!];
    expect(Math.max(...last.map(Math.abs))).toBeGreaterThan(0.05);
    for (const i of [SR / 4, SR / 2, SR]) expect(last[i]).toBeCloseTo(first[i]! * ratio, 5);
  });
});
