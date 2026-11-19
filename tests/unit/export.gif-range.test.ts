// MOD-Export / MOD-Core — F-016's GIF range end and the panel's GIF estimate (three of the GIF's frames
// encoded in the idle export worker, here a fake worker answering the calibration).
import { describe, expect, it } from 'vitest';
import { estimateGifBytes, gifCalibrationFrames, GIF_FIXED_BYTES, type FromExport, type ToExport } from '../../src/core';
import { estimate, planOutput } from '../../src/export';
import { CAPS, harness } from '../support/export-session';
import { proj, S, video } from '../support/project';

describe('RULE-16 the GIF range', () => {
  const project = proj({ clips: [video('a', 40)] });

  it('F-016.AC1 RULE-16 a 10–25 s range at 15 fps is 225 frames from 10 s', () => {
    const g = planOutput(project, { kind: 'gif', size: 480, rate: 15, from: 10 * S, to: 25 * S }, CAPS, false);
    expect(g.output).toMatchObject({ kind: 'gif', from: 10 * S, frames: 225, rate: 15 });
    expect(g.ext).toBe('gif');
  });

  it('RULE-16 a shorter range gives fewer frames; a range over 15 s or past the end is cut', () => {
    const at = (from: number, to: number, rate: 10 | 15 = 10) =>
      planOutput(project, { kind: 'gif', size: 320, rate, from: from * S, to: to * S }, CAPS, false).frames;
    expect(at(10, 12)).toBe(20);
    expect(at(0, 30)).toBe(150); // at most 15 s
    expect(at(35, 60)).toBe(50); // the project ends at 40 s
  });
});

describe('F-016 CMP-ExportPanel "gif" estimate', () => {
  it('MOD-Export the frames at 10, 50 and 90 % of the range are calibrated, each once', () => {
    expect(gifCalibrationFrames(225)).toEqual([22, 112, 202]);
    expect(gifCalibrationFrames(1)).toEqual([0]);
    expect(gifCalibrationFrames(2)).toEqual([0, 1]);
  });

  it('F-016 the estimate is the mean calibrated frame times the frames, plus the fixed parts', () => {
    expect(estimateGifBytes({ keyBytes: 30_000, keyCount: 3 }, 225)).toBe(GIF_FIXED_BYTES + 2_250_000);
  });

  it('F-016 MOD-Export estimate calibrates a GIF in the idle export worker at its size and range', async () => {
    const h = harness({ seconds: 40 });
    const settings = { kind: 'gif', size: 480, rate: 15, from: 10 * S, to: 25 * S } as const;
    const result = estimate(h.project, settings, h.ctx);
    await new Promise((r) => setTimeout(r, 0));
    const pair = h.pairs[0]!;
    const asked = pair.video.posted.find(
      (m): m is Extract<ToExport, { type: 'export:calibrate' }> => (m as ToExport).type === 'export:calibrate',
    );
    expect(asked?.job.output).toMatchObject({ kind: 'gif', width: 480, height: 270, from: 10 * S, frames: 225 });
    pair.video.emit({
      type: 'export:calibration',
      id: asked!.id,
      cal: { keyBytes: 30_000, keyCount: 3, deltaBytes: 0, deltaCount: 0 },
    } as FromExport);
    expect(await result).toEqual({ bytes: GIF_FIXED_BYTES + 2_250_000, reachable: true });
  });
});
