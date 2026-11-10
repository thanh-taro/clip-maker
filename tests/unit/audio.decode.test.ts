// MOD-Audio windowed decoding (ADR-0008 §2/§6 and outcome item 5) over a synthetic track behind the sound
// feed: stereo mapping, the window and eviction policy (memory bound, NFR-05), where a seek starts
// decoding, the priming removed by an edit list (INV-02), silent and failing sources.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHUNK,
  CODEC_PREROLL_S,
  DECODE_AHEAD,
  LIMITER_PREROLL,
  Mixer,
  MIX_LATENCY_MARGIN,
  originOf,
  seekDecodeFrom,
  SoundBank,
  soundDemand,
  toStereo,
  type SoundSource,
} from '../../src/audio';
import { voices, type Voice } from '../../src/plan';
import { audio, proj, video } from '../support/project';
import { fakeDecoders, fakeFeed, settle, type FakeTrack } from '../support/sound-feed';

const SR = 48_000;
const H = Math.SQRT1_2;

/** A track whose sample n is a slow two-tone pattern (exact in float32 at 48 kHz). */
const track = (seconds: number, extra: Partial<FakeTrack> = {}): FakeTrack => ({
  rate: SR,
  frames: 1024,
  priming: 0,
  length: Math.round(seconds * (extra.rate ?? SR)),
  channels: 2,
  sample: (n, c) => (n < 0 ? 0.9 : Math.fround(Math.sin(n * 0.001 + c) * 0.5)),
  ...extra,
});

/** A bank over fake tracks. */
function bankOf(tracks: Record<string, FakeTrack | null>, opts: Parameters<typeof fakeDecoders>[1] = {}) {
  const feed = fakeFeed(tracks);
  const decoders = fakeDecoders(tracks, opts);
  const bank = new SoundBank(feed, decoders);
  bank.setSources(Object.keys(tracks));
  return { bank, feed, decoders };
}

const read = (s: SoundSource | undefined, from: number, n: number): [Float32Array, Float32Array] => {
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  s?.read(from, L, R);
  return [L, R];
};

describe('MOD-Audio stereo mapping (ADR-0008 §2)', () => {
  it('ADR-0008 §2 mono plays on both sides at full level; stereo stays as it is', () => {
    const m = new Float32Array([0.5, -0.25]);
    expect(toStereo([m])).toEqual([m, m]);
    const r = new Float32Array([0.1, 0.2]);
    expect(toStereo([m, r])).toEqual([m, r]);
  });

  it('ADR-0008 §2 5.1 folds down by fixed rules: centre to both and surrounds to their side at −3 dB, LFE left out', () => {
    const ch = [1, 2, 4, 100, 8, 16].map((v) => new Float32Array([v]));
    const [L, R] = toStereo(ch);
    expect(L[0]).toBeCloseTo(1 + H * 4 + H * 8, 5);
    expect(R[0]).toBeCloseTo(2 + H * 4 + H * 16, 5);
    // Quad, 3.0 and 7.1 too; channels past 8 are left out.
    expect(toStereo([1, 2, 3].map((v) => new Float32Array([v])))[0][0]).toBeCloseTo(1 + 3 * H, 5);
    expect(toStereo([1, 2, 3, 4].map((v) => new Float32Array([v])))[1][0]).toBeCloseTo(2 + 4 * H, 5);
    const eight = toStereo([1, 2, 4, 100, 8, 16, 32, 64].map((v) => new Float32Array([v])));
    expect(eight[0][0]).toBeCloseTo(1 + H * (4 + 8 + 32), 4);
    expect(eight[1][0]).toBeCloseTo(2 + H * (4 + 16 + 64), 4);
  });
});

describe('MOD-Audio windowed decoding (ADR-0008 §6)', () => {
  it('ADR-0008 §6 a demanded range is decoded to the exact source samples; ready waits for it', async () => {
    const t = track(10);
    const { bank } = bankOf({ s: t });
    const want = [{ sourceId: 's', from: 3 * SR, to: 4 * SR }];
    bank.want(want);
    expect(bank.ready(want)).toBe(false);
    await bank.until(want);
    const [L, R] = read(bank.get('s'), 3 * SR, SR);
    for (const i of [0, 1, 777, SR - 1]) {
      expect(L[i]).toBe(t.sample(3 * SR + i, 0));
      expect(R[i]).toBe(t.sample(3 * SR + i, 1));
    }
  });

  it('ADR-0008 §6 NFR-05 playing 60 s of a 3-hour source keeps ≈ 2 s ahead and 1 s behind decoded, with one cursor and no re-seek', async () => {
    const { bank, feed, decoders } = bankOf({ s: track(3 * 3600) });
    const vs = voices(proj({ clips: [video('s', 3 * 3600)] })).map((v) => ({ ...v, sourceId: 's' }));
    let most = 0;
    for (let at = 0; at < 60 * SR; at += SR / 2) {
      bank.want(soundDemand(vs, at - LIMITER_PREROLL, at + 19_200 + DECODE_AHEAD));
      await bank.until(soundDemand(vs, at - MIX_LATENCY_MARGIN, at + 4800 + MIX_LATENCY_MARGIN));
      await settle(10);
      // ≈ 2 s ahead of the queued lead is decoded once the decoder has caught up.
      expect(bank.ready(soundDemand(vs, at, at + 19_200 + DECODE_AHEAD))).toBe(true);
      most = Math.max(most, bank.bytes);
    }
    // 1 s behind + 0.4 s lead + 2 s ahead, plus the feed's batch and pad and a chunk at each end.
    const bound = (3.4 + 0.75) * SR * 8 + 2 * CHUNK * 8;
    expect(most).toBeLessThanOrEqual(bound);
    expect(most).toBeLessThan(2_000_000); // ≈ 1.7 MB, against 4.1 GB for the whole source
    expect(feed.log.opens).toHaveLength(1);
    expect(bank.cursors).toBe(1);
    // A seek far away frees the old window and opens one decode there.
    bank.want(soundDemand(vs, 9000 * SR - LIMITER_PREROLL, 9000 * SR + DECODE_AHEAD));
    await settle();
    expect(feed.log.opens).toHaveLength(2);
    expect(bank.cursors).toBe(1);
    expect(bank.bytes).toBeLessThan(2_000_000);
    expect(decoders.live).toBe(1);
    bank.want([]);
    await settle();
    expect(bank.bytes).toBe(0);
    expect(decoders.live).toBe(0);
    expect(feed.log.open).toBe(0);
  });

  it('ADR-0008 outcome item 5 after a seek at 2× decoding starts at the previous sync point’s source position − 32 ms (minus the codec pre-roll)', async () => {
    const p = proj({ clips: [video('a', 60, { speedPct: 200 }, 5)] });
    const [v] = voices(p) as [Voice];
    const out = Math.round(13.37 * SR); // output sample of the seek, inside the clip
    const d = soundDemand([v], out, out + 4800)[0]!;
    // The sync point before 13.37 s of output is at 13 s; at 2× that is 26 s of source after the in point.
    expect(seekDecodeFrom(2, out)).toBe(26 * SR - Math.round(0.032 * SR));
    expect(d.from).toBeLessThanOrEqual(originOf(v) + 26 * SR - 0.032 * SR);
    expect(d.from).toBeGreaterThan(originOf(v) + 26 * SR - 0.04 * SR);
    const { bank, feed } = bankOf({ 'src-a': track(120) });
    bank.want([d]);
    await bank.until([d]);
    // 0.12 s codec pre-roll and 10 ms for the resampler's support.
    expect(feed.log.opens[0]![1]).toBeCloseTo(d.from / SR - CODEC_PREROLL_S - 0.01, 6);
  });

  it('ADR-0008 §6 every sample the mixer reads lies inside soundDemand (any speed, seek and block)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(25, 50, 75, 100, 150, 200, 335, 400),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 30 * SR }),
        fc.integer({ min: 1, max: 9000 }),
        (speedPct, inS, at, n) => {
          const p = proj({
            clips: [video('a', 50, { speedPct }, inS), video('b', 30, { speedPct: 100 })],
            audioClips: [audio('m', 1, 20)],
          });
          const vs = voices(p);
          const reads: [string, number, number][] = [];
          const spy = (id: string): SoundSource => ({
            length: Infinity,
            read: (from, L) => void reads.push([id, from, from + L.length]),
          });
          const mixer = new Mixer(vs, spy, 80 * SR);
          mixer.seek(at);
          mixer.process(new Float32Array(n), new Float32Array(n));
          const demand = soundDemand(vs, at - LIMITER_PREROLL - MIX_LATENCY_MARGIN, at + n + MIX_LATENCY_MARGIN);
          for (const [id, a, b] of reads)
            expect(
              demand.some((d) => d.sourceId === id && d.from <= a && b <= d.to),
              `${id} [${a}, ${b})`,
            ).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('ADR-0008 §6 two voices of one source far apart decode in two windows; close ones share one', async () => {
    const { bank, feed } = bankOf({ s: track(600) });
    bank.want([
      { sourceId: 's', from: 10 * SR, to: 12 * SR },
      { sourceId: 's', from: 300 * SR, to: 302 * SR },
    ]);
    await bank.until([{ sourceId: 's', from: 10 * SR, to: 12 * SR }]);
    await bank.until([{ sourceId: 's', from: 300 * SR, to: 302 * SR }]);
    expect(bank.cursors).toBe(2);
    bank.want([
      { sourceId: 's', from: 11 * SR, to: 12 * SR },
      { sourceId: 's', from: 12.5 * SR, to: 13 * SR },
    ]);
    expect(bank.cursors).toBe(1);
    expect(feed.log.opens).toHaveLength(2); // the window at 10 s goes on to 13 s
  });

  it('INV-02 ADR-0008 outcome item 3 the priming before time 0 (an input edit list) is silent; sample 0 is the first after it', async () => {
    const t = track(5, { priming: 2112 });
    const { bank, feed } = bankOf({ s: t });
    const d = [{ sourceId: 's', from: -2000, to: SR }];
    bank.want(d);
    await bank.until(d);
    expect(feed.log.opens[0]![1]).toBe(Number.NEGATIVE_INFINITY); // from the track's first packet
    const [L] = read(bank.get('s'), -2000, 4000);
    expect(L.subarray(0, 2000).every((v) => v === 0)).toBe(true);
    expect(L[2000]).toBe(t.sample(0, 0));
    expect(L[2001]).toBe(t.sample(1, 0));
  });

  it('INV-02 a 44.1 kHz source keeps its timing: an impulse at 0.1 s peaks at 48 kHz sample 4800', async () => {
    const t = track(2, { rate: 44_100, channels: 1, priming: 2112, sample: (n) => (n === 4410 ? 1 : n < 0 ? 0.9 : 0) });
    const { bank } = bankOf({ s: t });
    const d = [{ sourceId: 's', from: 0, to: SR }];
    bank.want(d);
    await bank.until(d);
    const [L, R] = read(bank.get('s'), 0, SR);
    let peak = 0;
    for (let i = 0; i < SR; i++) if (Math.abs(L[i]!) > Math.abs(L[peak]!)) peak = i;
    expect(peak).toBe(4800);
    expect(L[peak]).toBeGreaterThan(0.9); // one input sample at 44.1 kHz reaches ≈ 48/44.1·sinc(0)
    expect(R).toEqual(L); // mono on both sides
    expect(Math.max(...L.subarray(0, 4000).map(Math.abs))).toBeLessThan(1e-4); // the priming stayed out
  });

  it('INV-02 a window started by a seek gives the same samples as decoding from the start (44.1 kHz)', async () => {
    const t = track(20, { rate: 44_100 });
    const a = bankOf({ s: t }).bank;
    const b = bankOf({ s: t }).bank;
    const from = 12 * SR;
    a.want([{ sourceId: 's', from: 0, to: 14 * SR }]);
    b.want([{ sourceId: 's', from, to: 14 * SR }]);
    await a.until([{ sourceId: 's', from: 0, to: 14 * SR }]);
    await b.until([{ sourceId: 's', from, to: 14 * SR }]);
    expect(read(b.get('s'), from, 2 * SR)).toEqual(read(a.get('s'), from, 2 * SR));
  });

  it('ADR-0008 §6 a file without sound, or a codec the device can’t decode, is silent and never waited for', async () => {
    const none = bankOf({ s: null });
    none.bank.want([{ sourceId: 's', from: 0, to: SR }]);
    await none.bank.until([{ sourceId: 's', from: 0, to: SR }]);
    expect(none.bank.source('s')?.silent).toBe(true);
    expect(read(none.bank.get('s'), 0, 10)[0].every((v) => v === 0)).toBe(true);
    const unsupported = bankOf({ s: track(3) }, { unsupported: true });
    unsupported.bank.want([{ sourceId: 's', from: 0, to: SR }]);
    await unsupported.bank.until([{ sourceId: 's', from: 0, to: SR }]);
    expect(unsupported.bank.source('s')?.silent).toBe(true);
  });

  it('ADR-0008 §6 a decode error is reported for the demanded source (exports fail on it) and the source is then silent', async () => {
    const { bank } = bankOf({ s: track(30) }, { failAfter: 20 });
    const d = [{ sourceId: 's', from: 0, to: 5 * SR }];
    bank.want(d);
    await bank.until(d);
    expect(bank.failureOf(d)).toMatch(/^s: .*EncodingError: bad packet/);
    expect(bank.bytes).toBe(0);
  });

  it('ADR-0008 §6 sources without sound are not decoded; removing a source frees its windows', async () => {
    const { bank, feed } = bankOf({ s: track(10), q: track(10) });
    bank.setSources(['s']);
    expect(bank.get('q')).toBeUndefined();
    bank.want([
      { sourceId: 's', from: 0, to: SR },
      { sourceId: 'q', from: 0, to: SR },
    ]);
    await bank.until([{ sourceId: 's', from: 0, to: SR }]);
    expect(feed.log.opens.map((o) => o[0])).toEqual(['s']);
    bank.setSources([]);
    expect(bank.bytes).toBe(0);
  });
});
