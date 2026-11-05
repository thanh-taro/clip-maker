// MOD-Core export schedule: integer-µs frame times across 24/25/30/60 fps (rules.md "Frame times",
// ADR-0010 §1) and the source time each frame reads at any speed (MOD-Plan, project vs source rate).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { frameStart, gopFrames, scheduledFrame, sizeTargetPlan, type FrameRate } from '../../src/core';
import { framePlan } from '../../src/plan';
import { proj, video, videoSource } from '../support/project';

const rates = fc.constantFrom<FrameRate>(24, 25, 30, 60);

describe('MOD-Export frame schedule', () => {
  it('ADR-0010 §1 frame k is stamped at frameStart(k) in whole µs and lasts until the next frame starts', () => {
    fc.assert(
      fc.property(rates, fc.integer({ min: 0, max: 36_000 }), (rate, k) => {
        const f = scheduledFrame(k, rate);
        expect(Number.isInteger(f.timestamp) && Number.isInteger(f.duration)).toBe(true);
        expect(f.timestamp).toBe(frameStart(k, rate));
        expect(f.timestamp + f.duration).toBe(scheduledFrame(k + 1, rate).timestamp);
        expect(f.duration === Math.floor(1e6 / rate) || f.duration === Math.ceil(1e6 / rate)).toBe(true);
        expect(f.key).toBe(k % gopFrames(rate) === 0);
      }),
    );
  });

  it('ADR-0010 §1 the sum of frame durations equals the project end (no drift over 10 minutes)', () => {
    fc.assert(
      fc.property(rates, (rate) => {
        const n = rate * 600;
        let sum = 0;
        for (let k = 0; k < n; k++) sum += scheduledFrame(k, rate).duration;
        expect(sum).toBe(frameStart(n, rate));
      }),
      { numRuns: 4 },
    );
  });

  it('INV-02 each export frame reads the source frame the preview shows: in point + elapsed × speed, independent of the source rate', () => {
    fc.assert(
      fc.property(
        rates,
        fc.constantFrom(24, 25, 30, 50, 60),
        fc.constantFrom(25, 50, 100, 200, 400),
        fc.integer({ min: 0, max: 200 }),
        (rate, sourceRate, speedPct, k) => {
          const project = proj({
            clips: [video('a', 30, { speedPct })],
            sources: [videoSource('src-a', 30, { frameRate: sourceRate })],
            rate,
          });
          const plan = framePlan(project, k);
          if (plan.layers.length === 0) return;
          const expected = Math.round((frameStart(k, rate) * speedPct) / 100);
          expect(plan.layers[0]!.sourceTime).toBe(expected);
        },
      ),
    );
  });

  it('RULE-15 a size target reachable at a resolution stays reachable at every lower one with a lower floor', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 600 }), rates, (x, secs, rate) => {
        const offered = [480, 720, 1080, 1440, 2160] as const;
        const at = (r: (typeof offered)[number]) =>
          sizeTargetPlan({ targetMB: x, seconds: secs, rate, audioBps: 128_000, resolution: r, offered: [...offered] });
        for (let i = 1; i < offered.length; i++)
          if (at(offered[i]!).reachable) expect(at(offered[i - 1]!).reachable).toBe(true);
        const none = at(480);
        if (!none.reachable) expect(none.smallestTargetMB).toBeGreaterThan(x - 1);
      }),
    );
  });
});
