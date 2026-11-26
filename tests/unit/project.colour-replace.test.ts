// MOD-Project colour replace operations (RULE-25, RULE-24 *Reset, copy and compare* and *History*, RULE-13; F-028):
// add (a pick), set From/To/Range/Softness, remove, reset per value and per tool, Reset all, Apply to all, Copy and
// Paste (which replace the target's list, never merge), compare, grey and faint From colours, and one undo step per
// edit. The UI halves of these criteria (pick mode, the cards, the limit text) are in tests/e2e/colour-replace.spec.ts.
import { describe, expect, it } from 'vitest';
import { drawList, NEUTRAL } from '../../src/compositor';
import { normaliseColourTools, type Clip, type ColourTools, type Project } from '../../src/core';
import { framePlan } from '../../src/plan';
import {
  addReplacement,
  applyToAll,
  EMPTY_HISTORY,
  gradeOf,
  pasteGrade,
  record,
  removeReplacement,
  resetAdjustments,
  resetReplace,
  setMixer,
  setReplacement,
  undoStep,
  type EditResult,
  type History,
} from '../../src/project';
import { photo, proj, video } from '../support/project';

const RED = '#C8281E';
const GREEN = '#2E9E3A';
const BLUE = '#0050FF';
const GREY = '#808080';
const FAINT = '#9A8A8A'; // C* between 2 and 12
const three = (): Project => proj({ clips: [photo('A', 3), video('B', 3), photo('C', 3)] });
const clip = (p: Project, id = 'A'): Clip => p.clips.find((c) => c.id === id)!;
const list = (p: Project, id = 'A') => clip(p, id).colourTools?.replace ?? [];
function commit(h: History, p: Project, r: EditResult): { p: Project; h: History } {
  return { p: r.project, h: record(h, { before: p, after: r.project, changed: r.changed, gesture: null }) };
}

describe('F-028 colour replace operations', () => {
  it('F-028.AC1 (project) a pick adds a replacement with From and To set to that colour, Range 30, Softness 50, as one undo step', () => {
    const p = three();
    const s = commit(EMPTY_HISTORY, p, addReplacement(p, 'A', '#c8281e'));
    expect(list(s.p)).toEqual([{ from: RED, to: RED, range: 30, softness: 50 }]);
    expect(s.h.past.length).toBe(1);
    expect(undoStep(s.h)!.step.before).toBe(p);
  });

  it('F-028.AC2 (project) a fourth replacement is refused; removing one is one undo step and makes room again', () => {
    let p = three();
    for (const c of [RED, GREEN, BLUE]) p = addReplacement(p, 'A', c).project;
    expect(list(p)).toHaveLength(3);
    expect(addReplacement(p, 'A', '#E0A000').project).toBe(p);
    const s = commit(EMPTY_HISTORY, p, removeReplacement(p, 'A', 1));
    expect(list(s.p).map((r) => r.from)).toEqual([RED, BLUE]);
    expect(s.h.past.length).toBe(1);
    expect(list(addReplacement(s.p, 'A', '#E0A000').project)).toHaveLength(3);
  });

  it('F-028.AC8 (project) a grey From is refused with COPY-notice.replace_grey: nothing is added, and a replacement’s From stays', () => {
    const p = three();
    const r = addReplacement(p, 'A', GREY);
    expect(r.project).toBe(p);
    expect(r.notices).toEqual(['notice.replace_grey']);
    const q = addReplacement(p, 'A', RED).project;
    const r2 = setReplacement(q, 'A', 0, { from: GREY });
    expect(r2.project).toBe(q);
    expect(r2.notices).toEqual(['notice.replace_grey']);
  });

  it('F-028.AC11 (project) resetting the first one’s Range returns only it to 30; resetting colour replace or Reset all removes both; Apply to all, Copy and Paste carry them; compare draws the clip without them', () => {
    let p = three();
    p = addReplacement(p, 'A', RED).project;
    p = setReplacement(p, 'A', 0, { to: BLUE, range: 70 }).project;
    p = addReplacement(p, 'A', GREEN).project;
    p = setReplacement(p, 'A', 1, { range: 60, softness: 20 }).project;
    const reset = setReplacement(p, 'A', 0, { range: 30 }).project; // the per-row Reset sets the default
    expect(list(reset)).toEqual([
      { from: RED, to: BLUE, range: 30, softness: 50 },
      { from: GREEN, to: GREEN, range: 60, softness: 20 },
    ]);
    expect(clip(resetReplace(p, 'A').project).colourTools).toBeUndefined();
    expect(clip(resetAdjustments(p, 'A').project).colourTools).toBeUndefined();
    // Apply to all: one step; clip C's own list is replaced, not merged.
    p = addReplacement(p, 'C', '#E0A000').project;
    const s = commit(EMPTY_HISTORY, p, applyToAll(p, 'A'));
    expect(s.h.past.length).toBe(1);
    for (const id of ['B', 'C']) expect(list(s.p, id)).toEqual(list(p));
    // Copy and Paste: the target's list is replaced, never merged.
    const pasted = pasteGrade(p, 'C', gradeOf(clip(p))).project;
    expect(list(pasted, 'C')).toEqual(list(p));
    // Compare: clip A drawn with the neutral grade (no replace stage).
    const size = [{ width: 1200, height: 1600, rotation: 0 as const }];
    expect(drawList(framePlan(p, 0), 640, 360, size, new Map(), { compare: 'A' }).layers[0]!.grade).toBe(NEUTRAL);
    expect(drawList(framePlan(p, 0), 640, 360, size, new Map()).layers[0]!.grade.replace?.params).toHaveLength(1);
  });

  it('F-028.AC15 (project) a faint From (C* 2 to 12) is accepted with COPY-notice.replace_faint, by a pick and by entry', () => {
    const p = three();
    const r = addReplacement(p, 'A', FAINT);
    expect(list(r.project)).toEqual([{ from: FAINT, to: FAINT, range: 30, softness: 50 }]);
    expect(r.notices).toEqual(['notice.replace_faint']);
    const q = addReplacement(p, 'A', RED).project;
    const r2 = setReplacement(q, 'A', 0, { from: FAINT });
    expect(list(r2.project)[0]!.from).toBe(FAINT);
    expect(r2.notices).toEqual(['notice.replace_faint']);
    // Once per pick: picking the same faint colour again shows the hint again, though nothing changes.
    const r3 = setReplacement(r2.project, 'A', 0, { from: FAINT });
    expect(r3.project).toBe(r2.project);
    expect(r3.notices).toEqual(['notice.replace_faint']);
  });

  it('F-028.AC17 (project) picking again sets From only; To stays, as one undo step', () => {
    let p = addReplacement(three(), 'A', RED).project;
    p = setReplacement(p, 'A', 0, { to: BLUE }).project;
    const s = commit(EMPTY_HISTORY, p, setReplacement(p, 'A', 0, { from: GREEN }));
    expect(list(s.p)).toEqual([{ from: GREEN, to: BLUE, range: 30, softness: 50 }]);
    expect(s.h.past.length).toBe(1);
  });

  it('RULE-25 colour replace keeps its list with the other tools; RULE-13 an edit back to where it began leaves the same document', () => {
    let p = setMixer(three(), 'A', 'red', { hue: 20 }).project;
    p = addReplacement(p, 'A', RED).project;
    const away = setReplacement(p, 'A', 0, { softness: 80 }).project;
    expect(clip(setReplacement(away, 'A', 0, { softness: 50 }).project)).toEqual(clip(p));
    expect(setReplacement(p, 'A', 0, { softness: 50 }).project).toBe(p);
    expect(setReplacement(p, 'A', 5, { softness: 10 }).project).toBe(p);
    expect(clip(p).colourTools?.mixer).toEqual({ red: { hue: 20 } });
  });

  it('RULE-25 normalisation: at most three, hex upper case, Range and Softness clamped to whole 0–100; a project without colour replace is unchanged (schema backward compatible)', () => {
    const t = normaliseColourTools({
      replace: [
        { from: '#c8281e', to: '#0050ff', range: 140, softness: -3.4 },
        { from: 'nope', to: '#0050FF', range: 30, softness: 50 },
        { from: '#2E9E3A', to: '#2E9E3A', range: 30.6, softness: 50 },
        { from: '#2E9E3A', to: '#2E9E3A', range: 30, softness: 50 },
        { from: '#2E9E3A', to: '#2E9E3A', range: 30, softness: 50 },
      ],
    } as unknown as ColourTools);
    expect(t?.replace).toEqual([
      { from: RED, to: BLUE, range: 100, softness: 0 },
      { from: GREEN, to: GREEN, range: 31, softness: 50 },
      { from: GREEN, to: GREEN, range: 30, softness: 50 },
    ]);
    expect(normaliseColourTools({ replace: [] })).toBeUndefined();
    expect(normaliseColourTools({ mixer: { red: { hue: 5 } } })).toEqual({ mixer: { red: { hue: 5 } } });
  });
});
