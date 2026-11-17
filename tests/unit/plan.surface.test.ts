// MOD-Plan public surface (phase 3.3 scaffold) and the GIF frame recipe (RULE-16).
import { describe, expect, it } from 'vitest';
import { frameStart, gifDelays } from '../../src/core';
import { SAMPLE_RATE, framePlan, gifFramePlan, thumbnailPlan } from '../../src/plan';
import { EMPTY_PROJECT } from '../../src/project';
import { proj, video } from '../support/project';

it('MOD-Plan mixes at 48 kHz (architecture.md A4); a thumbnail of a clip not on the track has no plan', () => {
  expect(SAMPLE_RATE).toBe(48_000);
  expect(thumbnailPlan(EMPTY_PROJECT, 'x', 0)).toBeNull();
});

describe('MOD-Plan GIF frames', () => {
  it('RULE-16 NFR-08 GIF frame i shows the project frame the preview shows at from + i ÷ rate', () => {
    const project = proj({ clips: [video('a', 20)], rate: 30 });
    const from = 2_000_000;
    for (const rate of [10, 15]) {
      for (let i = 0; i < 15 * rate; i++) {
        const plan = gifFramePlan(project, { from, rate }, i);
        const t = from + Math.round((i * 1e6) / rate);
        expect(plan.time).toBeLessThanOrEqual(t);
        expect(frameStart(plan.frameIndex + 1, 30)).toBeGreaterThan(t);
        expect(plan).toEqual(framePlan(project, plan.frameIndex));
      }
    }
  });

  it('RULE-16 NFR-08 with its delays every GIF frame is shown within one GIF frame of its preview time', () => {
    const project = proj({ clips: [video('a', 20)], rate: 24 });
    const rate = 15;
    const d = gifDelays(rate, 225);
    let at = 0;
    for (let i = 0; i < 225; i++) {
      const plan = gifFramePlan(project, { from: 0, rate }, i);
      expect(Math.abs(at * 10_000 - plan.time)).toBeLessThan(1e6 / rate);
      at += d[i]!;
    }
  });
});
