// MOD-Compositor, MOD-Engine and MOD-Preview in real engines (ADR-0006/0007/0009 outcomes, ADR-0016 §4),
// on the media harness (tests/harness/video.ts). Clips are encoded in the page with each frame's index
// drawn as black/white blocks, so a painted frame can be read back and checked exactly.
import { expect, test } from '@playwright/test';
import { reference } from '../../src/compositor';
import { deRgb, lab, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
const ts = (k: number, rate: number): number => Math.floor((k * 1_000_000) / rate);

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.locator('#out')).toHaveText('ready');
});

test.describe('MOD-Compositor on the GPU', () => {
  for (const adj of [
    {},
    { contrast: 100 },
    { brightness: -100 },
    { shadows: 100, highlights: -100 },
    { temperature: 100, saturation: 100 },
  ]) {
    test(`RULE-08 the 8-bit preview of the grey ramp is within ΔE00 1 of the full-precision result and never reverses by more than ΔL* 0.5 ${JSON.stringify(adj)}`, async ({
      page,
    }) => {
      const px = await page.evaluate((a) => window.harness.video.gpuRamp(a), adj);
      let worstDe = 0;
      let worstReverse = 0;
      let prevL = -Infinity;
      for (let i = 0; i < 256; i++) {
        const gpu: Rgb = [px[i * 4]! / 255, px[i * 4 + 1]! / 255, px[i * 4 + 2]! / 255];
        const ref = reference.grade([i / 255, i / 255, i / 255], adj) as Rgb;
        worstDe = Math.max(worstDe, deRgb(gpu, ref));
        const L = lab(gpu)[0];
        worstReverse = Math.min(worstReverse, L - prevL);
        prevL = Math.max(prevL, L);
      }
      test.info().annotations.push({
        type: 'ramp',
        description: `max ΔE00 ${worstDe.toFixed(3)}, worst reversal ${worstReverse.toFixed(3)}`,
      });
      expect(worstDe).toBeLessThanOrEqual(1);
      expect(worstReverse).toBeGreaterThanOrEqual(-0.5);
    });
  }

  test('ADR-0006 outcome rule 6 after a WebGL context loss the compositor re-creates its resources and paints the same picture', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const r = await page.evaluate(() => window.harness.video.contextLoss(500));
    expect(r.lostSeen).toBe(true);
    expect(r.lostFlag).toBe(true);
    expect(r.recovered).toBe(true);
    expect(r.ms).toBeLessThan(5 * 400 + 500); // within the 5 tries, 400 ms apart
    expect(r.after).toEqual(r.before);
  });

  test('ADR-0006 outcome rule 6 when the context never comes back, recovery fails after 5 tries', async ({ page }) => {
    test.setTimeout(30_000);
    const r = await page.evaluate(() => window.harness.video.contextLoss(60_000));
    expect(r.recovered).toBe(false);
    expect(r.ms).toBeGreaterThanOrEqual(4 * 400 - 50);
  });

  test('RULE-22 the effects check draws the full chain at 1080p and reports its rate', async ({ page }) => {
    test.setTimeout(60_000);
    const r = await page.evaluate(() => window.harness.video.effects());
    expect(r.ok).toBe(true);
    expect(r.fps).toBeGreaterThan(0);
    expect(r.slow).toBe(r.fps < 30);
    test.info().annotations.push({ type: 'effects', description: JSON.stringify(r) });
  });
});

test.describe('MOD-Compositor review fixes (E3)', () => {
  test('F-009 a cross-fade whose second frame is missing shows weight × clip + weight × background (never darker)', async ({
    page,
  }) => {
    const r = await page.evaluate(() => window.harness.video.crossFadeMissing());
    const expected = [255 * (r.w0 + r.w1), 255 * r.w1, 255 * r.w1];
    r.px.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(2));
  });

  test('MOD-Compositor the texture of a removed text layer is deleted', async ({ page }) => {
    expect(await page.evaluate(() => window.harness.video.textTextures())).toEqual([2, 1]);
  });
});

test.describe('MOD-Engine decode and seek', () => {
  test('F-002.R1 a decoded frame is painted full-frame and reads back as the frame for the time (seek at frame boundaries)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const rate = 30;
    const ks = [0, 1, 29, 30, 31, 59, 60, 89, 45, 3, 75];
    const times = ks.flatMap((k) => [ts(k, rate), ts(k + 1, rate) - 3]);
    const r = await page.evaluate(
      ({ times }) => window.harness.video.engineSeeks({ rate: 30, frames: 90, gop: 30 }, times),
      { times },
    );
    expect(r.exact.every(Boolean)).toBe(true);
    expect(r.codes).toEqual(ks.flatMap((k) => [k, k]));
    const sorted = [...r.ms].sort((a, b) => a - b);
    test.info().annotations.push({
      type: 'seek ms',
      description: `p50 ${sorted[sorted.length >> 1]!.toFixed(1)} max ${sorted.at(-1)!.toFixed(1)}`,
    });
  });

  test('MOD-Engine a 25 fps project over a 30 fps source shows the source frame whose interval holds each project frame', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const projectFrames = [0, 1, 2, 24, 25, 49, 70];
    const times = projectFrames.map((k) => ts(k, 25));
    const r = await page.evaluate(
      ({ times }) => window.harness.video.engineSeeks({ rate: 30, frames: 90, gop: 15 }, times, 25),
      { times },
    );
    // Source frame j covers [ts(j, 30), ts(j+1, 30)); the project time ts(k, 25) maps 1:1 to source time.
    const expected = times.map((t) => {
      let j = Math.floor((t * 30) / 1_000_000);
      while (ts(j + 1, 30) <= t + 2) j++;
      return j;
    });
    expect(r.codes).toEqual(expected);
  });
});

test.describe('MOD-Preview playback with the audio clock', () => {
  test(
    'F-002.R2 picture follows the sound clock: frames shown match the time heard, without a dropped-frame storm',
    { tag: '@realtime' },
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.evaluate(() => window.harness.video.prepareSync({ rate: 30, frames: 180, gop: 30 }));
      await page.click('#play');
      await page.waitForFunction(() => window.harness.video.clockRunning(), undefined, { timeout: 5_000 });
      await page.waitForTimeout(3_000);
      const r = await page.evaluate(() => window.harness.video.syncResult());
      const stats = r.stats as { painted: number; skipped: number; inexact: number };
      const shown = r.shown.filter((s) => s.heard > 300_000); // after the first 0.3 s of start-up
      const offsets = shown.map((s) => (s.heard - s.t) / 1000).sort((a, b) => a - b); // ms
      const p95 = offsets[Math.floor(offsets.length * 0.95)] ?? Infinity;
      test.info().annotations.push({
        type: 'sync',
        description: `frames ${shown.length}, offset ms min ${offsets[0]?.toFixed(1)} p50 ${offsets[offsets.length >> 1]?.toFixed(1)} p95 ${p95.toFixed(1)}; ${JSON.stringify(stats)}`,
      });
      expect(shown.length).toBeGreaterThan(30);
      // The frame shown is never ahead of the sound, and at most ~3 frames behind it at arrival.
      expect(offsets[0]!).toBeGreaterThanOrEqual(-1);
      expect(p95).toBeLessThan(100);
      // No dropped-frame storm: most project frames were painted.
      expect(stats.skipped / Math.max(1, stats.painted + stats.skipped)).toBeLessThan(0.25);
    },
  );
});
