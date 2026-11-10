// MOD-Export — the export-audio worker's mix waits for decoded sound block by block (ADR-0008 §6 and
// outcome item 9; build question 33): `prepare` runs before each 100 ms block in mix order, a decode
// error fails the export, and the samples equal the same sound given whole.
import { describe, expect, it } from 'vitest';
import { endSampleOf, MIX_LATENCY_MARGIN, pcmSource, soundDemand, SoundBank } from '../../src/audio';
import { MIX_BLOCK, wavAudio, type MixJob } from '../../src/export/audio-pass';
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
  return {
    calls,
    job: {
      voices: vs,
      bank: bank.get,
      endSample: endSampleOf(project),
      prepare: async (from, to) => {
        calls.push([from, to]);
        bank.want(soundDemand(vs, from - MIX_LATENCY_MARGIN, to + MIX_LATENCY_MARGIN + 2 * SR));
        const need = soundDemand(vs, from - MIX_LATENCY_MARGIN, to + MIX_LATENCY_MARGIN);
        await bank.until(need);
        const f = bank.failureOf(need);
        if (f) throw new Error(f);
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
});
