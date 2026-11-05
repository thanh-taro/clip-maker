// MOD-Engine decoder slot with a fake decoder and track (ADR-0009 outcome rules 1–6): restarts only when
// needed, open-GOP leading pictures dropped, edit-list frames before 0 dropped, ≤ 12 frames held,
// coarse-then-exact, slow sources shown at their newest frame, WebKit-style held-back frames flushed.
import { beforeEach, describe, expect, it } from 'vitest';
import { IDLE_MS, PLAY_WAIT_MS } from '../../src/engine';
import { FakeFrame, fakeSlot, type DecoderLog } from '../support/engine';

const ts30 = (k: number): number => Math.floor((k * 1_000_000) / 30);
let log: DecoderLog;
beforeEach(() => {
  log = { decoded: [], restarts: 0, flushes: 0 };
});

describe('ADR-0009 decoder slot', () => {
  it('MOD-Engine playing forward decodes on without restarting; a backward seek restarts once', async () => {
    const slot = fakeSlot({ rate: 30, frames: 120, gop: 30 }, {}, log);
    for (let k = 0; k < 60; k++) expect((await slot.frameAt(ts30(k), 'exact')).frame!.timestamp).toBe(ts30(k));
    expect(slot.stats.restarts).toBe(1);
    await slot.frameAt(ts30(10), 'exact');
    expect(slot.stats.restarts).toBe(2);
    slot.close();
  });

  it('MOD-Engine a seek past the next keyframe restarts there (no decoding through the gap)', async () => {
    const slot = fakeSlot({ rate: 30, frames: 300, gop: 30 }, {}, log);
    await slot.frameAt(0, 'exact');
    log.decoded = [];
    await slot.frameAt(ts30(205), 'exact');
    expect(Math.min(...log.decoded)).toBe(ts30(180));
    slot.close();
  });

  it('MOD-Engine at most 12 decoded frames are held per decoder and evicted frames are closed', async () => {
    const before = FakeFrame.open;
    const slot = fakeSlot({ rate: 30, frames: 120, gop: 120 }, {}, log);
    for (let k = 0; k < 100; k += 7) {
      await slot.frameAt(ts30(k), 'exact');
      await slot.prefetch(ts30(k));
      expect(slot.openFrames).toBeLessThanOrEqual(12);
    }
    slot.close();
    await new Promise((r) => setTimeout(r, 5));
    expect(FakeFrame.open).toBe(before);
  });

  it('MOD-Engine after a restart, open-GOP leading pictures are dropped before decoding', async () => {
    const slot = fakeSlot({ rate: 30, frames: 90, gop: 30, leading: 2 }, {}, log);
    const r = await slot.frameAt(ts30(35), 'exact');
    expect(r.frame!.timestamp).toBe(ts30(35));
    expect(slot.stats.skippedLeading).toBe(2);
    expect(log.decoded.every((t) => t >= ts30(30))).toBe(true);
    slot.close();
  });

  it('MOD-Engine frames with negative times (input edit list) are dropped; time 0 shows the first frame at or after 0', async () => {
    const slot = fakeSlot({ rate: 30, frames: 60, gop: 30, offsetUs: -20_000 }, {}, log);
    const r = await slot.frameAt(0, 'exact');
    expect(r.frame!.timestamp).toBe(ts30(1) - 20_000);
    expect(slot.frames.every((f) => f.timestamp >= 0)).toBe(true);
    slot.close();
  });

  it('MOD-Engine a decoder that holds frames back (WebKit) is flushed and still gives the exact frame', async () => {
    const slot = fakeSlot({ rate: 30, frames: 20, gop: 30 }, { holdBack: 4 }, log);
    const r = await slot.frameAt(ts30(19), 'exact');
    expect(r.exact).toBe(true);
    expect(r.frame!.timestamp).toBe(ts30(19));
    expect(log.flushes).toBeGreaterThanOrEqual(1);
    slot.close();
  });

  it('NFR-03 a seek far past the keyframe paints the first decoded frame first (coarse), then the exact one', async () => {
    const slot = fakeSlot({ rate: 30, frames: 300, gop: 300 }, { delayMs: 1 }, log);
    const coarse: number[] = [];
    const r = await slot.frameAt(ts30(200), 'exact', (f) => {
      coarse.push(f.timestamp);
      f.close();
    });
    expect(coarse).toEqual([0]);
    expect(r.frame!.timestamp).toBe(ts30(200));
    slot.close();
  });

  it('RULE-22 while playing, a slow decoder returns the newest frame within the wait and never restarts ahead', async () => {
    const slot = fakeSlot({ rate: 30, frames: 300, gop: 30 }, { delayMs: 40 }, log);
    await slot.frameAt(0, 'exact');
    const restarts = slot.stats.restarts;
    let r = await slot.frameAt(ts30(20), 'play');
    for (const k of [40, 60, 70]) {
      const t0 = performance.now();
      r = await slot.frameAt(ts30(k), 'play');
      expect(performance.now() - t0).toBeLessThan(PLAY_WAIT_MS + 60);
    }
    expect(r.exact).toBe(false);
    expect(r.frame!.timestamp).toBeLessThan(ts30(70));
    expect(slot.stats.restarts).toBe(restarts); // continuous playback: decode forward, never restart
    slot.close();
  });

  it('F-002.R3 a seek while playing (a jump) restarts at the target’s keyframe instead of decoding the gap', async () => {
    const slot = fakeSlot({ rate: 30, frames: 600, gop: 30 }, { delayMs: 5 }, log);
    await slot.frameAt(0, 'play');
    await slot.frameAt(ts30(1), 'play');
    log.decoded = [];
    await slot.frameAt(ts30(400), 'play', undefined, true);
    expect(Math.min(...log.decoded)).toBe(ts30(390));
    // A jump further than 1 s between playing requests (a cut) counts as one too.
    log.decoded = [];
    await slot.frameAt(ts30(500), 'play');
    expect(Math.min(...log.decoded)).toBe(ts30(480));
    slot.close();
  });

  it('MOD-Engine one decoder error rejects; the retry makes a fresh decoder that prefers software', async () => {
    const slot = fakeSlot({ rate: 30, frames: 60, gop: 30 }, { failDecoders: 1 }, log);
    await expect(slot.frameAt(ts30(5), 'exact')).rejects.toThrow('Decoder failure');
    expect((await slot.frameAt(ts30(5), 'exact')).frame!.timestamp).toBe(ts30(5));
    expect(log.made).toEqual([false, true]);
    slot.close();
  });

  it('MOD-Engine close() during a request answers no frame, makes no new decoder and leaves no frame open', async () => {
    await new Promise((r) => setTimeout(r, 100)); // earlier tests' late outputs settle first
    const before = FakeFrame.open;
    const slot = fakeSlot({ rate: 30, frames: 300, gop: 30 }, { delayMs: 30 }, log);
    const pending = slot.frameAt(ts30(25), 'exact');
    await new Promise((r) => setTimeout(r, 5));
    slot.close();
    const made = log.made!.length;
    const r = await pending;
    expect(r.frame).toBeNull();
    expect(await slot.frameAt(ts30(3), 'exact')).toMatchObject({ frame: null });
    await new Promise((r) => setTimeout(r, 60)); // late outputs of the closed decoder are closed too
    expect(log.made!.length).toBe(made);
    expect(FakeFrame.open).toBe(before);
  });

  it('MOD-Engine a slow but working decoder is not flushed: idleness is time since its last output', async () => {
    const slot = fakeSlot({ rate: 30, frames: 300, gop: 300 }, { delayMs: 60 }, log);
    expect(IDLE_MS).toBeGreaterThanOrEqual(150);
    const r = await slot.frameAt(ts30(40), 'exact');
    expect(r.exact).toBe(true);
    expect(r.frame!.timestamp).toBe(ts30(40));
    expect(slot.stats.flushes).toBe(0);
    slot.close();
  });

  it('F-015.R4 the export reader never flushes mid-clip: a decoder holding frames back is fed on instead', async () => {
    const slot = fakeSlot({ rate: 30, frames: 120, gop: 120 }, { holdBack: 14 }, log, { idleFlush: false });
    for (const k of [0, 1, 2, 30]) expect((await slot.frameAt(ts30(k), 'exact')).frame!.timestamp).toBe(ts30(k));
    expect(slot.stats.flushes).toBe(0);
    expect(slot.stats.restarts).toBe(1);
    // At the clip end the remaining frames come out with a flush.
    expect((await slot.frameAt(ts30(119), 'exact')).frame!.timestamp).toBe(ts30(119));
    slot.close();
  }, 15_000);
});
