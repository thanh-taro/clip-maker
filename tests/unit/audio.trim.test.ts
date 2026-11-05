// MOD-Audio verify-and-trim strategy (ADR-0008 outcome rule 2), against modelled codecs.
import { describe, expect, it } from 'vitest';
import { verifyAndTrim } from '../../src/audio';

/** A codec model: decoded peak = base + slope × gain (dB). Records the gains it was asked for. */
function codec(base: number, slope = 1) {
  const gains: number[] = [];
  return { gains, pass: (g: number) => (gains.push(g), base + slope * g) };
}

describe('MOD-Audio verify-and-trim', () => {
  it('RULE-12 a decoded export already at or below −1.0 dBTP is kept after one pass at 0 dB', async () => {
    const c = codec(-1.2);
    expect(await verifyAndTrim(c.pass)).toEqual({ gainDb: 0, peakDb: -1.2, passes: 1, fallback: false });
  });

  it('RULE-12 an overshoot is trimmed toward −1.5 dBTP: first step = excess over −1.5 dB + 0.2 dB', async () => {
    const c = codec(+0.9);
    const r = await verifyAndTrim(c.pass);
    expect(c.gains[1]).toBeCloseTo(-(0.9 + 1.5 + 0.2), 9);
    expect(r.passes).toBe(2);
    expect(r.peakDb!).toBeLessThanOrEqual(-1.0);
    expect(r.fallback).toBe(false);
  });

  it('RULE-12 later steps use the measured gain→peak slope (secant) and stop within 3 passes', async () => {
    // A codec whose peak falls only 0.3 dB per dB of gain: the first step is not enough.
    const c = codec(+0.5, 0.3);
    const r = await verifyAndTrim(c.pass);
    expect(r.passes).toBe(3);
    // Secant from (0, 0.5) and (-2.2, -0.16): aims exactly at −1.5.
    expect(r.peakDb!).toBeCloseTo(-1.5, 9);
    expect(r.gainDb).toBeCloseTo(-2 / 0.3, 9);
  });

  it('RULE-12 still above −1.0 dBTP after 3 passes: a fixed −3 dB trim is taken and recorded', async () => {
    const gains: number[] = [];
    const r = await verifyAndTrim((g) => (gains.push(g), 2)); // a codec that ignores the gain
    expect(gains.length).toBe(4);
    expect(r.fallback).toBe(true);
    expect(r.gainDb).toBeCloseTo(gains[2]! - 3, 9);
    expect(gains[3]).toBe(r.gainDb);
  });

  it('ADR-0008 outcome item 2 the fallback encode is not measured (measure = false)', async () => {
    const measured: boolean[] = [];
    await verifyAndTrim((_g, measure = true) => (measured.push(measure), 2));
    expect(measured).toEqual([true, true, true, false]);
  });

  it('ADR-0008 outcome item 2 a trim can start from a project’s earlier shared gain', async () => {
    const c = codec(+2);
    const r = await verifyAndTrim(c.pass, -1);
    expect(c.gains[0]).toBe(-1);
    expect(r.peakDb!).toBeLessThanOrEqual(-1.0);
  });
});
