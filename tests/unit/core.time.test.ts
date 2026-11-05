// MOD-Core frame-time maths (rules.md "Frame times") and the rule tables.
import { describe, expect, it } from 'vitest';
import {
  RULE_03,
  RULE_06,
  frameStart,
  framesOf,
  halfFrames,
  minDuration,
  minFrames,
  pickedFrames,
  snapToFrame,
  NOTICES,
  clampText,
  characterCount,
  newTextFrames,
  textFadeFrames,
  placedRect,
  DEFAULT_PLACEMENT,
} from '../../src/core';
import { CATALOG } from '../../src/copy/messages.gen';

describe('MOD-Core frame times', () => {
  it('MOD-Core frame k starts at floor(k × 1e6 ÷ rate) µs', () => {
    expect(frameStart(1, 30)).toBe(33_333);
    expect(frameStart(2, 30)).toBe(66_666);
    expect(frameStart(3, 30)).toBe(100_000);
    expect(frameStart(1, 24)).toBe(41_666);
    expect(frameStart(25, 25)).toBe(1_000_000);
  });

  it('MOD-Core a duration of n frames counts back as round(d × rate ÷ 1e6)', () => {
    expect(framesOf(frameStart(91, 30), 30)).toBe(91);
    expect(framesOf(120_000, 24)).toBe(3);
  });

  it('MOD-Core an entered time goes to the nearest frame start; exactly halfway goes earlier', () => {
    // 25 fps: frames at 0 and 40,000 µs; 20,000 is halfway.
    expect(snapToFrame(20_000, 25)).toBe(0);
    expect(snapToFrame(20_001, 25)).toBe(40_000);
    expect(snapToFrame(19_999, 25)).toBe(0);
  });

  it('RULE-05 the 0.1 s minimum rounds up to whole frames', () => {
    expect([24, 25, 30, 60].map((r) => minFrames(r as 24))).toEqual([3, 3, 3, 6]);
    expect(minDuration(24)).toBe(125_000);
    expect(minDuration(30)).toBe(100_000);
  });

  it('F-009.AC8 a 1 s cross-fade at 25 fps is exactly 25 frames; 0.3 s is 8 frames (halfway rounds up)', () => {
    expect(pickedFrames(10, 25)).toBe(25);
    expect(pickedFrames(3, 25)).toBe(8);
    expect(pickedFrames(3, 24)).toBe(7);
  });

  it('MOD-Core half of a length in frames rounds down', () => {
    expect(halfFrames(5)).toBe(2);
  });

  it('RULE-03 RULE-06 limits are the spec numbers', () => {
    expect(RULE_03.maxProjectSeconds).toBe(600);
    expect(RULE_06.quickPct).toEqual([25, 50, 100, 150, 200, 400]);
  });

  it('MOD-Core every notice a rule produces is a COPY ID in the catalog', () => {
    for (const id of NOTICES) expect(CATALOG['en-US']).toHaveProperty(id);
  });
});

describe('MOD-Core text maths', () => {
  it('F-010.AC6 pasting 20 characters into 495 adds only 5 and never splits one', () => {
    const existing = 'a'.repeat(495);
    // "Đà Lạt" typed with combining marks: NFC composes them; each is one user-perceived character.
    const pasted = 'Đà Lạt ẩm ướt '.normalize('NFD') + 'ở đây';
    const result = clampText(existing + pasted);
    expect(characterCount(result)).toBe(500);
    expect(result.slice(495)).toBe('Đà Lạ'.normalize('NFC'));
    expect(result).toBe(result.normalize('NFC'));
  });

  it('RULE-11 a new layer lasts 3 s from the playhead, ending at the project end when it would run past', () => {
    expect(newTextFrames(60, 300, 30)).toEqual([60, 150]);
    expect(newTextFrames(290, 300, 30)).toEqual([290, 300]);
    expect(newTextFrames(300, 300, 30)).toEqual([297, 300]);
  });

  it('F-010.AC9 in an empty project a new layer runs from 0 to 3 s', () => {
    expect(newTextFrames(0, 0, 30)).toEqual([0, 90]);
  });

  it('RULE-10 the text fade is 0.3 s, or half the layer when shorter', () => {
    expect(textFadeFrames(90, 30)).toBe(9);
    expect(textFadeFrames(10, 30)).toBe(5);
  });
});

describe('MOD-Core placement geometry', () => {
  it('RULE-07 Fit shows the whole rotated clip; Fill covers the frame', () => {
    // 16:9 clip in a 1080×1920 (9:16) frame.
    const fit = placedRect(1080, 1920, 1920, 1080, DEFAULT_PLACEMENT);
    expect(fit.width).toBeCloseTo(1080);
    expect(fit.height).toBeCloseTo(607.5);
    const fill = placedRect(1080, 1920, 1920, 1080, { ...DEFAULT_PLACEMENT, mode: 'fill' });
    expect(fill.height).toBeCloseTo(1920);
    expect(fill.width).toBeGreaterThan(1080);
    const turned = placedRect(1080, 1920, 1920, 1080, { ...DEFAULT_PLACEMENT, rotation: 90 });
    expect(turned.width).toBeCloseTo(1080);
    expect(turned.height).toBeCloseTo(1920);
  });
});
