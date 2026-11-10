// MOD-Audio windowed decoding — window reuse and limits (ADR-0008 §6; E6 review items 1, 3, 4, 6, 8, 9,
// 11): a seek back inside a window, a duplicated clip, a window still waiting for its first output, more
// ranges than windows, the Opus pre-skip with and without an edit list, decode errors and unsupported
// codecs in exports. Checked on samples, not only on `ready`.
import { describe, expect, it } from 'vitest';
import { fewest, SoundBank, soundDemand, type Demand } from '../../src/audio';
import { voices } from '../../src/plan';
import { proj, video } from '../support/project';
import { fakeDecoders, fakeFeed, settle, type FakeTrack } from '../support/sound-feed';

const SR = 48_000;
/** A track whose sample n is n's own small pattern (never 0 after the priming). */
const track = (seconds: number, extra: Partial<FakeTrack> = {}): FakeTrack => ({
  rate: SR,
  frames: 1024,
  priming: 0,
  length: seconds * SR,
  channels: 2,
  sample: (n) => (n < 0 ? 0.9 : Math.fround(0.1 + 0.05 * Math.sin(n * 0.001))),
  ...extra,
});

function rig(t: FakeTrack, opts: Parameters<typeof fakeDecoders>[1] = {}, strict = false) {
  const tracks = { s: t };
  const feed = fakeFeed(tracks);
  const bank = new SoundBank(feed, fakeDecoders(tracks, opts), undefined, strict);
  bank.setSources(['s']);
  return { bank, feed };
}

const read = (bank: SoundBank, from: number, n: number): Float32Array => {
  const L = new Float32Array(n);
  bank.get('s')!.read(from, L, new Float32Array(n));
  return L;
};

const expectSamples = (bank: SoundBank, t: FakeTrack, from: number, n: number) => {
  const L = read(bank, from, n);
  for (const i of [0, 1, Math.floor(n / 2), n - 1]) expect(L[i], `sample ${from + i}`).toBe(t.sample(from + i, 0));
};

describe('MOD-Audio windows (ADR-0008 §6)', () => {
  it('ADR-0008 §6 a seek back inside a played window decodes again: the samples are there, not silence', async () => {
    const t = track(100);
    const { bank, feed } = rig(t);
    for (let at = 0; at <= 20 * SR; at += SR / 2) {
      bank.want([{ sourceId: 's', from: Math.max(0, at - SR), to: at + 3 * SR }]);
      await settle(5);
    }
    const d = [{ sourceId: 's', from: 10 * SR, to: 12 * SR }];
    bank.want(d);
    await bank.until(d);
    expectSamples(bank, t, 10 * SR, SR);
    expect(feed.log.opens).toHaveLength(2); // the freed range needed a new window
  });

  it('ADR-0008 §6 a duplicated clip reading an earlier part of the source gets its own window; the live one keeps playing', async () => {
    const t = track(60);
    const { bank } = rig(t);
    // The original clip plays 0–10 s of the source; its duplicate follows on the timeline.
    const vs = voices(proj({ clips: [video('a', 10), video('a2', 10)] })).map((v) => ({ ...v, sourceId: 's' }));
    const at = 9.5 * SR; // near the end of the first clip: both windows are wanted
    for (let x = 0; x <= at; x += SR / 2) {
      bank.want(soundDemand(vs, x - SR, x + 2.4 * SR));
      await settle(5);
    }
    const now = soundDemand(vs, at - SR, at + 2.4 * SR);
    await bank.until(now);
    expect(bank.cursors).toBe(2);
    expectSamples(bank, t, 9 * SR, SR / 2); // the first clip's window
    expectSamples(bank, t, 0, SR / 2); // the duplicate's start
  });

  it('ADR-0008 §6 a window still waiting for its first output is reused, not reopened, by the next wants', async () => {
    const t = track(60);
    const { bank, feed } = rig(t, { delayMs: 30 });
    const d = [{ sourceId: 's', from: 3 * SR, to: 4 * SR }];
    bank.want(d);
    bank.want(d);
    await Promise.resolve();
    bank.want([{ sourceId: 's', from: 3 * SR + 100, to: 4 * SR + 100 }]);
    await bank.until([{ sourceId: 's', from: 3 * SR + 100, to: 4 * SR + 100 }]);
    expect(feed.log.opens).toHaveLength(1);
  });

  it('ADR-0008 §6 more ranges than windows (9 > 8): the closest are joined, every range is decoded', async () => {
    const t = track(60);
    const { bank } = rig(t);
    const ranges: Demand[] = Array.from({ length: 9 }, (_, i) => ({
      sourceId: 's',
      from: Math.round(i * 2.1 * SR) + 1,
      to: Math.round(i * 2.1 * SR) + 1000,
    }));
    bank.want(ranges);
    await bank.until(ranges);
    expect(bank.cursors).toBe(8);
    for (const r of ranges) expectSamples(bank, t, r.from, r.to - r.from);
    expect(
      fewest(
        [
          [0, 1],
          [5, 6],
          [7, 8],
          [20, 21],
        ],
        3,
      ),
    ).toEqual([
      [0, 1],
      [5, 8],
      [20, 21],
    ]);
  });

  it('INV-02 the Opus pre-skip is removed once: with packet times from 0 (WebM, Ogg) and with an edit list (MP4)', async () => {
    for (const edit of [false, true]) {
      const t = track(4, { opus: true, priming: 312, edit });
      const { bank } = rig(t);
      const d = [{ sourceId: 's', from: 0, to: SR }];
      bank.want(d);
      await bank.until(d);
      const L = read(bank, -400, 1400);
      expect(
        L.subarray(0, 400).every((v) => v === 0),
        `edit ${edit}: silent before 0`,
      ).toBe(true);
      expect(L[400], `edit ${edit}: sample 0`).toBe(t.sample(0, 0));
      expect(L[1399]).toBe(t.sample(999, 0));
    }
  });

  it('ADR-0008 §6 a decode error reports the decoder’s own message', async () => {
    const { bank } = rig(track(30), { failAfter: 3 });
    const d = [{ sourceId: 's', from: 0, to: 5 * SR }];
    bank.want(d);
    await bank.until(d);
    expect(bank.failureOf(d)).toBe('s: Error: EncodingError: bad packet');
  });

  it('ADR-0008 §6 question 33 in an export a codec the device can’t decode is an error, in the preview silence', async () => {
    const d = [{ sourceId: 's', from: 0, to: SR }];
    const strict = rig(track(3), { unsupported: true }, true).bank;
    strict.want(d);
    await strict.until(d);
    expect(strict.failureOf(d)).toMatch(/NotSupportedError/);
    const preview = rig(track(3), { unsupported: true }).bank;
    preview.want(d);
    await preview.until(d);
    expect(preview.failureOf(d)).toBeNull();
    expect(preview.source('s')?.silent).toBe(true);
  });

  it('ADR-0008 §6 until gives up with a TimeoutError naming the source (exports never hang)', async () => {
    const { bank } = rig(track(30), { hang: true });
    const d = [{ sourceId: 's', from: 0, to: SR }];
    bank.want(d);
    await expect(bank.until(d, 50)).rejects.toThrow(/TimeoutError: the sound of s was not decoded within 50 ms/);
  });
});
