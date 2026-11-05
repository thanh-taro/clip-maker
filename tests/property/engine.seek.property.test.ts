// MOD-Engine seek target selection across 24/25/30/60 fps sources (ADR-0009 outcome rule 1, rules.md
// "Source frames"): whatever the order of seeks, the frame returned is the one whose display interval
// [ts, next ts) contains the source time, and at most 12 frames are held.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FakeFrame, fakeSlot } from '../support/engine';

const frameTs = (k: number, rate: number): number => Math.floor((k * 1_000_000) / rate);

describe('rules.md "Source frames" — seek accuracy', () => {
  for (const rate of [24, 25, 30, 60]) {
    it(`MOD-Engine random seeks return the frame whose display interval holds the time (${rate} fps)`, async () => {
      const frames = 3 * rate;
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: frameTs(frames, rate) - 3 }), { minLength: 1, maxLength: 12 }),
          async (times) => {
            const slot = fakeSlot({ rate, frames, gop: rate });
            for (const t of times) {
              const r = await slot.frameAt(t, 'exact');
              expect(r.exact).toBe(true);
              const ts = r.frame!.timestamp;
              const k = Math.round((ts * rate) / 1_000_000);
              expect(ts).toBe(frameTs(k, rate));
              expect(ts).toBeLessThanOrEqual(t + 2);
              // The index lookup is getPacket(t + 2 µs); exactly +2 µs is a floating-point tie in seconds.
              expect(frameTs(k + 1, rate)).toBeGreaterThanOrEqual(t + 2);
              expect(slot.openFrames).toBeLessThanOrEqual(12);
            }
            slot.close();
          },
        ),
        { numRuns: 25 },
      );
    });
  }

  it('MOD-Engine frame boundaries: the last µs of a frame still shows it, its start shows the next', async () => {
    const slot = fakeSlot({ rate: 30, frames: 90, gop: 30 });
    for (const k of [0, 1, 29, 30, 31, 59, 60, 88]) {
      expect((await slot.frameAt(frameTs(k, 30), 'exact')).frame!.timestamp).toBe(frameTs(k, 30));
      expect((await slot.frameAt(frameTs(k + 1, 30) - 3, 'exact')).frame!.timestamp).toBe(frameTs(k, 30));
    }
    const before = FakeFrame.open;
    const held = slot.openFrames;
    slot.close();
    expect(FakeFrame.open).toBe(before - held); // closing the slot closes every frame it held
  });
});
