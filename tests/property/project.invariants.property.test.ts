// INV-03, INV-04, INV-06, INV-07 (+ RULE-05 minimums, RULE-10 limits, frame times) after every
// operation, and undo/redo round trips (RULE-13). ADR-0011 §2, ADR-0016 property tests.
import fc from 'fast-check';
import { beforeEach, expect, it } from 'vitest';
import {
  invariantViolations,
  maxProjectFrames,
  projectEnd,
  projectFrames,
  type FrameRate,
  type Project,
} from '../../src/core';
import { framePlan } from '../../src/plan';
import * as P from '../../src/project';
import { S, audioSource, photoSource, proj, videoSource } from '../support/project';

type Op = (p: Project, nextId: () => string) => P.EditResult;
type Pick = 'any' | 'clip' | 'text' | 'audio';

const none = (p: Project): P.EditResult => ({ project: p, notices: [], changed: [] });
function idOf(p: Project, kind: Pick, i: number): string | undefined {
  const ids = {
    clip: p.clips.map((c) => c.id),
    text: p.textLayers.map((t) => t.id),
    audio: p.audioClips.map((a) => a.id),
  };
  const xs = kind === 'any' ? [...ids.clip, ...ids.text, ...ids.audio] : ids[kind];
  return xs.length ? xs[i % xs.length] : undefined;
}
/** A time as a fraction (0–1.1) of the project length (10 s when empty). */
const at = (p: Project, x: number) => Math.round((x / 1000) * (projectEnd(p) || 10 * S));
const frac = fc.integer({ min: 0, max: 1100 });
const idx = fc.nat(200);
/** An op on an existing item of `kind`; a no-op when there is none. */
const on = <A>(
  kind: Pick,
  arb: fc.Arbitrary<A>,
  f: (p: Project, id: string, a: A, nextId: () => string) => P.EditResult,
) =>
  fc.tuple(idx, arb).map(([i, a]): Op => {
    const op: Op = (p, nextId) => {
      const id = idOf(p, kind, i);
      return id ? f(p, id, a, nextId) : none(p);
    };
    // Readable counterexamples: the operation's source and its arguments.
    return Object.assign(op, { [fc.toStringMethod]: () => `${f.toString()} on ${kind}#${i} ${JSON.stringify(a)}` });
  });
const edge = fc.constantFrom<'start' | 'end'>('start', 'end');

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc
    // Durations from one 60 fps frame (below every minimum) up to 60 s (review E1 #10).
    .tuple(fc.integer({ min: 16_667, max: 60 * S }), fc.constantFrom('video', 'photo', 'audio'))
    .map(([us, kind]): Op => (p, nextId) => {
      const id = nextId();
      const secs = us / S;
      const src = kind === 'audio' ? audioSource(id, secs) : kind === 'photo' ? photoSource(id) : videoSource(id, secs);
      return P.addMedia(p, [src], at(p, 500), nextId);
    }),
  on('clip', idx, (p, id, j) => P.moveClip(p, id, j % p.clips.length)),
  on('any', fc.constant(0), (p, id) => P.deleteItem(p, id)),
  on('clip', fc.constant(0), (p, id, _, nextId) => P.duplicateClip(p, id, nextId)),
  on('clip', fc.integer({ min: 0, max: 60 * S }), (p, id, x) => P.setClipIn(p, id, x)),
  on('clip', fc.integer({ min: 0, max: 60 * S }), (p, id, x) => P.setClipOut(p, id, x)),
  on('clip', fc.integer({ min: 0, max: 70 * S }), (p, id, x) => P.setPhotoDuration(p, id, x)),
  on('any', fc.tuple(frac, edge), (p, id, [x, e]) => P.trimTo(p, id, e, at(p, x))),
  on('any', frac, (p, id, x, nextId) => P.splitAt(p, id, at(p, x), nextId)),
  on('clip', fc.integer({ min: 0, max: 500 }), (p, id, s) => P.setSpeed(p, id, s)),
  on('clip', fc.integer({ min: 0, max: 30 }), (p, id, x) => P.setCrossFade(p, id, x)),
  on('any', fc.tuple(fc.integer({ min: 0, max: 60 }), fc.constantFrom<'in' | 'out'>('in', 'out')), (p, id, [x, e]) =>
    P.setFade(p, id, e, x),
  ),
  frac.map(
    (x): Op =>
      (p, nextId) =>
        P.addText(p, at(p, x), nextId),
  ),
  on('text', fc.tuple(frac, frac), (p, id, [a, b]) => P.setTextTimes(p, id, at(p, a), at(p, b))),
  on('any', fc.integer({ min: -400, max: 400 }), (p, id, d) => P.moveItemTime(p, id, d)),
  // F-011.R1 (D-052): a Music pick of the user's own audio files, placed one after another at the playhead.
  fc.tuple(fc.array(fc.integer({ min: 1, max: 900 }), { minLength: 1, maxLength: 3 }), frac).map(
    ([tenths, x]): Op =>
      (p, nextId) =>
        P.addMedia(
          p,
          tenths.map((d) => audioSource(nextId(), d / 10)),
          at(p, x),
          nextId,
        ),
  ),
  on('audio', frac, (p, id, x) => P.moveAudio(p, id, at(p, x))),
  on('audio', fc.constant(0), (p, id, _, nextId) => P.duplicateAudio(p, id, nextId)),
  fc.constantFrom<FrameRate>(24, 25, 30, 60).map(
    (r): Op =>
      (p) =>
        P.setFrameRate(p, r),
  ),
  idx.map(
    (i): Op =>
      (p) =>
        p.sources.length ? P.removeSource(p, p.sources[i % p.sources.length]!.id) : none(p),
  ),
);

/** A starting project with a few clips, a text layer and an audio clip. */
const seedArb = fc
  .tuple(
    fc.array(fc.integer({ min: 2, max: 900 }), { minLength: 1, maxLength: 5 }),
    fc.boolean(),
    fc.constantFrom<FrameRate>(24, 25, 30, 60),
  )
  .map(([tenths, chosen, rate]) => {
    let n = 0;
    const nextId = () => `s${++n}`;
    const sources = tenths.map((d, i) =>
      i % 3 === 2 ? photoSource(`v${i}`) : videoSource(`v${i}`, d / 10, { frameRate: i === 1 ? 60 : 30 }),
    );
    let p: Project = {
      ...proj({ rate }),
      frame: { aspect: 'original' as const, frameRate: rate, background: 'black' as const, frameRateChosen: chosen },
    };
    p = P.addMedia(p, [...sources, audioSource('a0', 7)], 0, nextId).project;
    p = P.addText(p, 0, nextId).project;
    return p;
  });

beforeEach(() => P.newProject());

it('INV-03 INV-04 INV-06 hold after every operation (with RULE-05 minimums and RULE-10 limits)', () => {
  let changed = 0;
  fc.assert(
    fc.property(seedArb, fc.array(opArb, { minLength: 1, maxLength: 40 }), (seed, ops) => {
      let n = 0;
      const nextId = () => `x${++n}`;
      let p = seed;
      expect(invariantViolations(p)).toEqual([]);
      for (const op of ops) {
        const r = op(p, nextId);
        if (r.project === p) continue;
        changed++;
        expect(invariantViolations(r.project)).toEqual([]);
        expect(projectFrames(r.project)).toBeLessThanOrEqual(maxProjectFrames(r.project.frame.frameRate));
        expect(Object.isFrozen(r.project)).toBe(true);
        p = r.project;
      }
    }),
    { numRuns: 300 },
  );
  // The generator must exercise real edits, not mostly no-ops.
  expect(changed).toBeGreaterThan(1000);
});

it('RULE-13 undoing every step restores the first project and redoing them restores the last', () => {
  fc.assert(
    fc.property(seedArb, fc.array(opArb, { minLength: 1, maxLength: 30 }), (seed, ops) => {
      P.newProject();
      P.edit(() => ({ project: seed, notices: [], changed: [] }));
      let n = 0;
      const nextId = () => `x${++n}`;
      const first = P.project.value;
      for (const op of ops) P.edit((p) => op(p, nextId));
      const last = P.project.value;
      let steps = 0;
      while (P.history.value.past.length > 1) {
        P.undo();
        steps++;
        expect(P.playhead.value).toBeLessThanOrEqual(projectEnd(P.project.value));
      }
      expect(P.project.value).toBe(first);
      for (let i = 0; i < steps; i++) P.redo();
      expect(P.project.value).toBe(last);
      expect(P.canRedo.value).toBe(false);
    }),
    { numRuns: 100 },
  );
});

it('INV-07 RULE-10 every frame plan stays inside the project and its cross-fade weights sum to 1', () => {
  fc.assert(
    fc.property(seedArb, fc.array(opArb, { minLength: 1, maxLength: 25 }), fc.nat(), (seed, ops, pos) => {
      let n = 0;
      const nextId = () => `x${++n}`;
      let p = seed;
      for (const op of ops) p = op(p, nextId).project;
      const frames = projectFrames(p);
      const k = pos % (frames + 2);
      const plan = framePlan(p, k);
      if (k >= frames) {
        expect(plan.layers).toEqual([]);
        expect(plan.texts).toEqual([]);
      } else {
        expect(plan.layers.length).toBeGreaterThanOrEqual(1);
        expect(plan.layers.length).toBeLessThanOrEqual(2);
        expect(plan.layers.reduce((s, l) => s + l.weight, 0)).toBeCloseTo(1, 9);
        for (const t of plan.texts) expect(t.layer.start).toBeLessThan(projectEnd(p));
      }
    }),
    { numRuns: 200 },
  );
});
