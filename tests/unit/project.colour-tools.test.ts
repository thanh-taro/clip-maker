// MOD-Project colour-tool operations (RULE-24, RULE-13; F-024…F-027 R4): set and reset per value and per tool,
// Reset all keeps the look, Apply to all / Copy / Paste carry the colour tools, compare draws the clip without
// them, and each edit is one undo step. (The panels that call these come with the UI, with their keyboard and
// announcement criteria.)
import { describe, expect, it } from 'vitest';
import { drawList, NEUTRAL } from '../../src/compositor';
import { DUOTONE_PAIR_COLOURS, popSettings, splitSettings, type Clip, type Project } from '../../src/core';
import { framePlan } from '../../src/plan';
import {
  applyToAll,
  chooseDuotone,
  EMPTY_HISTORY,
  gradeOf,
  pasteGrade,
  record,
  resetAdjustments,
  resetDuotone,
  resetMixer,
  resetPop,
  resetSplitToning,
  setAdjustments,
  setDuotone,
  setMixer,
  setPop,
  setSplitToning,
  swapDuotone,
  undoStep,
  type EditResult,
  type History,
} from '../../src/project';
import { photo, proj, video } from '../support/project';

const look = { id: 'cine-moody', intensity: 80 };
const cols = (pair: keyof typeof DUOTONE_PAIR_COLOURS) => ({
  shadows: DUOTONE_PAIR_COLOURS[pair].shadows,
  highlights: DUOTONE_PAIR_COLOURS[pair].highlights,
});
const three = (): Project => proj({ clips: [photo('A', 3, { look }), video('B', 3), photo('C', 3)] });
const clip = (p: Project, id = 'A'): Clip => p.clips.find((c) => c.id === id)!;
/** Commits an edit as a RULE-13 step (as MOD-Project's `edit` does) and returns the project and history. */
function commit(h: History, p: Project, r: EditResult): { p: Project; h: History } {
  return { p: r.project, h: record(h, { before: p, after: r.project, changed: r.changed, gesture: null }) };
}

describe('F-024 colour mixer operations', () => {
  it('F-024.AC7 resetting Red Hue returns only it to 0; resetting the mixer returns all 24; Reset all clears tools and keeps the look', () => {
    let p = three();
    p = setMixer(p, 'A', 'red', { hue: 20 }).project;
    p = setMixer(p, 'A', 'blue', { lightness: -30 }).project;
    p = setMixer(p, 'A', 'red', { hue: 0 }).project; // the per-row Reset sets the default
    expect(clip(p).colourTools).toEqual({ mixer: { blue: { lightness: -30 } } });
    p = setMixer(p, 'A', 'green', { saturation: 40 }).project;
    p = resetMixer(p, 'A').project;
    expect(clip(p).colourTools).toBeUndefined();
    p = setAdjustments(p, 'A', { brightness: 30 }).project;
    p = setMixer(p, 'A', 'green', { saturation: 40 }).project;
    const r = resetAdjustments(p, 'A');
    expect(clip(r.project).adjustments).toEqual({});
    expect(clip(r.project).colourTools).toBeUndefined();
    expect(clip(r.project).look).toEqual(look);
  });

  it('F-024.AC8 Apply to all gives clips 2 and 3 clip 1’s mixer as one undo step; copy/paste matches; compare draws clip 1 without it', () => {
    let p = three();
    p = setMixer(p, 'A', 'red', { hue: 20, saturation: -10 }).project;
    p = setMixer(p, 'C', 'aqua', { lightness: 50 }).project;
    const before = p;
    const step = commit(EMPTY_HISTORY, p, applyToAll(p, 'A'));
    for (const id of ['B', 'C']) expect(clip(step.p, id).colourTools).toEqual(clip(p).colourTools);
    expect(step.h.past.length).toBe(1);
    const undone = undoStep(step.h)!;
    expect(undone.step.before).toBe(before);
    expect(clip(undone.step.before, 'C').colourTools).toEqual({ mixer: { aqua: { lightness: 50 } } });
    // Copy clip 1 and paste onto clip 3.
    const pasted = pasteGrade(before, 'C', gradeOf(clip(before))).project;
    expect(clip(pasted, 'C').colourTools).toEqual(clip(before).colourTools);
    // Compare: a draw option, not an edit — clip 1 is drawn with the neutral grade (no colour stage).
    const list = drawList(framePlan(before, 0), 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map(), {
      compare: 'A',
    });
    expect(list.layers[0]!.grade).toBe(NEUTRAL);
    const normal = drawList(framePlan(before, 0), 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map());
    expect(normal.layers[0]!.grade.hue?.mix).toBe(true);
  });

  it('RULE-13 F-024 a slider dragged away and back leaves the same document, so the gesture leaves no step', () => {
    const p = three();
    const away = setMixer(p, 'A', 'red', { hue: 30 }).project;
    const back = setMixer(away, 'A', 'red', { hue: 0 }).project;
    expect(clip(back)).toEqual(clip(p));
    expect(setMixer(p, 'A', 'red', { hue: 0 }).project).toBe(p);
  });
});

describe('F-025 colour pop operations', () => {
  it('F-025.AC1 choosing Red is one undo step and shows Range 50 and Amount 100', () => {
    const p = three();
    const s = commit(EMPTY_HISTORY, p, setPop(p, 'A', { colour: 'red' }));
    expect(s.h.past.length).toBe(1);
    expect(popSettings(clip(s.p).colourTools)).toEqual({ colour: 'red', range: 50, amount: 100 });
  });

  it('F-025.AC7 resetting Range returns it to 50 with Blue kept; resetting colour pop or Reset all returns it to None', () => {
    let p = setPop(three(), 'A', { colour: 'blue', range: 70 }).project;
    p = setPop(p, 'A', { range: 50 }).project;
    expect(popSettings(clip(p).colourTools)).toEqual({ colour: 'blue', range: 50, amount: 100 });
    const q = setPop(p, 'A', { range: 70, amount: 30 }).project;
    expect(popSettings(clip(resetPop(q, 'A').project).colourTools)).toEqual({ colour: null, range: 50, amount: 100 });
    expect(popSettings(clip(resetAdjustments(q, 'A').project).colourTools).colour).toBeNull();
  });

  it('F-025 edge: choosing None keeps Range and Amount, and choosing a colour again restores them', () => {
    let p = setPop(three(), 'A', { colour: 'green', range: 80, amount: 40 }).project;
    p = setPop(p, 'A', { colour: null }).project;
    expect(popSettings(clip(p).colourTools)).toEqual({ colour: null, range: 80, amount: 40 });
    p = setPop(p, 'A', { colour: 'aqua' }).project;
    expect(popSettings(clip(p).colourTools)).toEqual({ colour: 'aqua', range: 80, amount: 40 });
  });

  it('F-025.AC8 Apply to all (one step), copy/paste and compare carry colour pop', () => {
    const p = setPop(three(), 'A', { colour: 'red', range: 30 }).project;
    const s = commit(EMPTY_HISTORY, p, applyToAll(p, 'A'));
    expect(s.h.past.length).toBe(1);
    for (const id of ['B', 'C']) expect(clip(s.p, id).colourTools).toEqual({ pop: { colour: 'red', range: 30 } });
    expect(clip(pasteGrade(p, 'B', gradeOf(clip(p))).project, 'B').colourTools).toEqual(clip(p).colourTools);
    const list = drawList(framePlan(p, 0), 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map(), {
      compare: 'A',
    });
    expect(list.layers[0]!.grade.hue).toBeNull();
  });
});

describe('F-026 split toning operations', () => {
  it('F-026.AC6 resetting Balance returns only it to 0; resetting split toning or Reset all returns strengths 0, hues 210°/35°, Balance 0', () => {
    let p = setSplitToning(three(), 'A', { shadowsStrength: 50, balance: 30, highlightsHue: 90 }).project;
    p = setSplitToning(p, 'A', { balance: 0 }).project;
    expect(splitSettings(clip(p).colourTools)).toEqual({
      shadowsHue: 210,
      shadowsStrength: 50,
      highlightsHue: 90,
      highlightsStrength: 0,
      balance: 0,
    });
    const defaults = { shadowsHue: 210, shadowsStrength: 0, highlightsHue: 35, highlightsStrength: 0, balance: 0 };
    expect(splitSettings(clip(resetSplitToning(p, 'A').project).colourTools)).toEqual(defaults);
    expect(splitSettings(clip(resetAdjustments(p, 'A').project).colourTools)).toEqual(defaults);
  });

  it('F-026.AC7 Apply to all (one step), copy/paste and compare carry split toning', () => {
    const p = setSplitToning(three(), 'A', { highlightsStrength: 60 }).project;
    const s = commit(EMPTY_HISTORY, p, applyToAll(p, 'A'));
    expect(s.h.past.length).toBe(1);
    for (const id of ['B', 'C']) expect(clip(s.p, id).colourTools).toEqual({ splitToning: { highlightsStrength: 60 } });
    expect(clip(pasteGrade(p, 'C', gradeOf(clip(p))).project, 'C').colourTools).toEqual(clip(p).colourTools);
    const list = drawList(framePlan(p, 0), 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map(), {
      compare: 'A',
    });
    expect(list.layers[0]!.grade.split).toBeNull();
  });

  it('F-026 RULE-24 hues stay within 0°–359° (Up at 359° changes nothing)', () => {
    const p = setSplitToning(three(), 'A', { highlightsHue: 359 }).project;
    expect(setSplitToning(p, 'A', { highlightsHue: 360 }).project).toBe(p);
  });
});

describe('F-027 duotone operations', () => {
  const duo = (p: Project) => clip(p).colourTools?.duotone;

  it('F-027.AC1 choosing Midnight & Peach is one step at Strength 100; from Strength 40, choosing Plum & Gold starts at 100', () => {
    const p = three();
    const s = commit(EMPTY_HISTORY, p, chooseDuotone(p, 'A', 'midnight-peach'));
    expect(s.h.past.length).toBe(1);
    expect(duo(s.p)).toEqual({ on: true, pair: 'midnight-peach', ...cols('midnight-peach'), strength: 100 });
    const q = setDuotone(s.p, 'A', { strength: 40 }).project;
    expect(duo(q)?.strength).toBe(40);
    expect(duo(chooseDuotone(q, 'A', 'plum-gold').project)).toMatchObject({ pair: 'plum-gold', strength: 100 });
  });

  it('F-027.AC4 in Custom, the highlights colour is set by hex code; Swap exchanges the colours as one undo step', () => {
    let p = chooseDuotone(three(), 'A', 'custom').project;
    p = setDuotone(p, 'A', { highlights: '#ffd400' }).project;
    expect(duo(p)?.highlights).toBe('#FFD400');
    const s = commit(EMPTY_HISTORY, p, swapDuotone(p, 'A'));
    expect(s.h.past.length).toBe(1);
    expect(duo(s.p)).toMatchObject({ shadows: '#FFD400', highlights: DUOTONE_PAIR_COLOURS['midnight-peach'].shadows });
    // A built-in pair's colours are its own.
    const pair = chooseDuotone(three(), 'A', 'teal-cream').project;
    expect(setDuotone(pair, 'A', { shadows: '#000000' }).project).toBe(pair);
    expect(swapDuotone(pair, 'A').project).toBe(pair);
  });

  it('F-027.AC5 Custom starts from Midnight & Peach on a clip that never had a duotone, and from Plum & Gold after Plum & Gold then None', () => {
    expect(duo(chooseDuotone(three(), 'A', 'custom').project)).toEqual({
      on: true,
      pair: 'custom',
      ...cols('midnight-peach'),
      strength: 100,
    });
    let p = chooseDuotone(three(), 'A', 'plum-gold').project;
    p = chooseDuotone(p, 'A', null).project;
    expect(duo(p)?.on).toBe(false);
    expect(duo(chooseDuotone(p, 'A', 'custom').project)).toMatchObject({
      pair: 'custom',
      ...cols('plum-gold'),
    });
  });

  it('F-027.AC8 resetting Strength returns 100; reset or Reset all returns None and forgets the colours; Apply to all, copy/paste and compare carry it', () => {
    let p = chooseDuotone(three(), 'A', 'ink-coral').project;
    p = setDuotone(p, 'A', { strength: 40 }).project;
    p = setDuotone(p, 'A', { strength: 100 }).project;
    expect(duo(p)?.strength).toBe(100);
    for (const reset of [resetDuotone(p, 'A').project, resetAdjustments(p, 'A').project]) {
      expect(duo(reset)).toBeUndefined();
      expect(duo(chooseDuotone(reset, 'A', 'custom').project)).toMatchObject(cols('midnight-peach'));
    }
    const s = commit(EMPTY_HISTORY, p, applyToAll(p, 'A'));
    expect(s.h.past.length).toBe(1);
    for (const id of ['B', 'C']) expect(clip(s.p, id).colourTools).toEqual(clip(p).colourTools);
    expect(clip(pasteGrade(p, 'B', gradeOf(clip(p))).project, 'B').colourTools).toEqual(clip(p).colourTools);
    const list = drawList(framePlan(p, 0), 640, 360, [{ width: 1200, height: 1600, rotation: 0 }], new Map(), {
      compare: 'A',
    });
    expect(list.layers[0]!.grade.duotone).toBeNull();
  });

  it('F-027 edge: choosing a pair after editing Custom replaces the colours; Custom then starts from that pair', () => {
    let p = chooseDuotone(three(), 'A', 'custom').project;
    p = setDuotone(p, 'A', { shadows: '#112233' }).project;
    p = chooseDuotone(p, 'A', 'forest-lime').project;
    expect(duo(p)).toMatchObject(cols('forest-lime'));
    expect(duo(chooseDuotone(p, 'A', 'custom').project)).toMatchObject(cols('forest-lime'));
  });
});

describe('RULE-23 RULE-24 copy state', () => {
  it('RULE-24 a clip without colour tools copies and pastes exactly as before (1.1.0 documents unchanged)', () => {
    const p = three();
    expect(gradeOf(clip(p))).toEqual({ adjustments: {}, look });
    expect(pasteGrade(p, 'A', gradeOf(clip(p))).project).toBe(p);
  });
});
