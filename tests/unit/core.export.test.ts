// MOD-Core export tables and rate-control maths (RULE-15, RULE-16, ADR-0010 and its outcome).
import { describe, expect, it } from 'vitest';
import {
  bitrateFor,
  calibrationRanges,
  correctiveBps,
  estimateBytes,
  exportFileName,
  floorFor,
  gifDelays,
  gifOutputSize,
  predictedTargetBytes,
  sizeTargetPlan,
  targetVideoBps,
  videoOutputSize,
  VIDEO_AUDIO_BPS,
  type Calibration,
} from '../../src/core';

describe('MOD-Core export tables', () => {
  it('RULE-15 quality bitrates follow the architecture.md table at 30 fps', () => {
    expect(bitrateFor(480, 'smaller', 30)).toBe(900_000);
    expect(bitrateFor(720, 'balanced', 30)).toBe(3_000_000);
    expect(bitrateFor(1080, 'best', 30)).toBe(10_000_000);
    expect(bitrateFor(2160, 'balanced', 30)).toBe(24_000_000);
  });

  it('ADR-0010 §4 bitrates and floors scale ×1.5 at 60 fps and ×0.85 at 24/25 fps', () => {
    expect(bitrateFor(1080, 'balanced', 60)).toBe(9_000_000);
    expect(bitrateFor(1080, 'balanced', 24)).toBe(5_100_000);
    expect(bitrateFor(1080, 'balanced', 25)).toBe(5_100_000);
    expect(floorFor(480, 30)).toBe(300_000);
    expect(floorFor(720, 60)).toBe(900_000);
    expect(floorFor(1080, 25)).toBe(850_000);
  });

  it('ADR-0010 outcome item 9 output sides are even with the long side a multiple of 16 (480p = 848 × 480)', () => {
    expect(videoOutputSize(16 / 9, 480)).toEqual({ width: 848, height: 480 });
    expect(videoOutputSize(9 / 16, 480)).toEqual({ width: 480, height: 848 });
    expect(videoOutputSize(16 / 9, 720)).toEqual({ width: 1280, height: 720 });
    expect(videoOutputSize(9 / 16, 1080)).toEqual({ width: 1080, height: 1920 });
    expect(videoOutputSize(4 / 5, 1080)).toEqual({ width: 1080, height: 1344 });
    expect(videoOutputSize(1, 1080)).toEqual({ width: 1080, height: 1080 });
    for (const aspect of [16 / 9, 9 / 16, 4 / 5, 1.9, 0.42, 4 / 3])
      for (const r of [480, 720, 1080, 1440, 2160]) {
        const { width, height } = videoOutputSize(aspect, r);
        expect(Math.min(width, height)).toBe(r);
        expect(Math.max(width, height) % 16).toBe(0);
      }
  });

  it('RULE-16 a GIF has its longer side at the chosen size and an even shorter side', () => {
    expect(gifOutputSize(16 / 9, 480)).toEqual({ width: 480, height: 270 });
    expect(gifOutputSize(9 / 16, 320)).toEqual({ width: 180, height: 320 });
  });
});

describe('MOD-Core size target (RULE-15, D-020)', () => {
  it('ADR-0010 §5 the video bitrate of a 4 MB target over 60 s is about 365 kbps', () => {
    expect(targetVideoBps(4, 60, VIDEO_AUDIO_BPS) / 1000).toBeCloseTo(364.8, 1);
  });

  it('RULE-15 a 4 MB target on 60 s offers 480 when 1080 cannot meet it, and 1 MB offers the smallest whole MB 480 can meet (4 MB)', () => {
    const base = { seconds: 60, rate: 30 as const, audioBps: VIDEO_AUDIO_BPS, offered: [480, 720, 1080] as const };
    const four = sizeTargetPlan({ ...base, targetMB: 4, resolution: 1080, offered: [...base.offered] });
    expect(four).toMatchObject({ reachable: false, suggestedResolution: 480, smallestTargetMB: null });
    const one = sizeTargetPlan({ ...base, targetMB: 1, resolution: 1080, offered: [...base.offered] });
    expect(one).toMatchObject({ reachable: false, suggestedResolution: null, smallestTargetMB: 4 });
    expect(sizeTargetPlan({ ...base, targetMB: 25, resolution: 1080, offered: [...base.offered] }).reachable).toBe(
      true,
    );
  });

  it('ADR-0010 outcome item 7 the effective floor is the larger of the table floor and the delivered rate', () => {
    const plan = sizeTargetPlan({
      targetMB: 8,
      seconds: 60,
      rate: 30,
      audioBps: VIDEO_AUDIO_BPS,
      resolution: 1080,
      offered: [480, 720, 1080],
      delivered: { 1080: 2_642_000, 720: 1_358_000, 480: 633_000 },
    });
    // 8 MB / 60 s ≈ 860 kbps: below 1080's and 720's delivered minimum, above 480's.
    expect(plan).toMatchObject({ reachable: false, suggestedResolution: 480 });
  });

  it('ADR-0010 outcome item 7 the corrective pass asks bitrate × budget ÷ actual × 0.97', () => {
    expect(correctiveBps(1_000_000, 10_000_000, 11_000_000)).toBe(Math.floor((1e6 * 10e6 * 0.97) / 11e6));
  });
});

describe('MOD-Core estimate (ADR-0010 §6, outcome item 8)', () => {
  const cal: Calibration = { keyBytes: 3 * 40_000, keyCount: 3, deltaBytes: 177 * 5_000, deltaCount: 177 };

  it('ADR-0010 outcome item 8 the estimate is key-mean × keyframes + delta-mean × other frames, sound and 4 KB + 0.35 KB/s', () => {
    const frames = 1800;
    const video = 40_000 * 30 + 5_000 * 1770;
    const bytes = estimateBytes({ cal, frames, rate: 30, videoBps: 6_000_000, audioBps: 128_000 });
    expect(bytes).toBe(Math.round(video + 128_000 * 7.5 + 4000 + 350 * 60));
  });

  it('ADR-0010 outcome item 8 the calibrated video size is capped at the nominal bitrate', () => {
    const bytes = estimateBytes({ cal, frames: 1800, rate: 30, videoBps: 500_000, audioBps: 0 });
    expect(bytes).toBe(Math.round((500_000 * 60) / 8 + 4000 + 350 * 60));
  });

  it('ADR-0010 outcome item 7 the pre-check prediction is not capped', () => {
    expect(predictedTargetBytes(cal, 1800, 30, 0)).toBe(Math.round(40_000 * 30 + 5_000 * 1770 + 4000 + 350 * 60));
  });

  it('ADR-0010 outcome item 8 calibration samples 3 × 2 s at 10/50/90 %; short projects are encoded whole', () => {
    expect(calibrationRanges(1800, 30)).toEqual([
      [180, 240],
      [900, 960],
      [1620, 1680],
    ]);
    expect(calibrationRanges(150, 30)).toEqual([[0, 150]]);
    expect(calibrationRanges(1000, 25)).toEqual([
      [100, 150],
      [500, 550],
      [900, 950],
    ]);
  });
});

describe('MOD-Core files and GIF timing', () => {
  it('F-015.AC5 an export finished on 3 Nov 2026 at 14:05:09 local time is named clip-20261103-140509.mp4', () => {
    expect(exportFileName(new Date(2026, 10, 3, 14, 5, 9), 'mp4')).toBe('clip-20261103-140509.mp4');
    expect(exportFileName(new Date(2026, 0, 9, 4, 0, 0), 'm4a')).toBe('clip-20260109-040000.m4a');
  });

  it('RULE-16 GIF delays alternate 7, 7, 6 at 15 fps and every frame starts within one GIF frame of its time (NFR-08)', () => {
    expect(gifDelays(15, 6)).toEqual([7, 7, 6, 7, 7, 6]);
    expect(gifDelays(10, 3)).toEqual([10, 10, 10]);
    for (const rate of [10, 15]) {
      const d = gifDelays(rate, 225);
      let at = 0;
      d.forEach((x, i) => {
        expect(Math.abs(at / 100 - i / rate)).toBeLessThan(1 / rate);
        at += x;
      });
      expect(at).toBe(Math.ceil((225 * 100) / rate));
    }
  });
});
