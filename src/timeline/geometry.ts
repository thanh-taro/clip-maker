// MOD-Timeline — pure geometry of CMP-Timeline: the scale that fits the project, the main-track clip
// boxes (INV-03: end to end from 0, a cross-fade overlapping both neighbours by its duration), the ruler
// ticks, the clip boundary nearest a drop point (RULE-05 reorder) and the time under the pointer.
// Implements: CMP-Timeline "wide / default" (clip widths equal duration × the ruler scale), RULE-05
// reorder target, F-002.R3 (the ruler's time under the pointer), F-003.R2. F-004 adds an item's span, the
// time under a trim drag and RULE-14 snapping of a trimmed edge (F-004.R4).
import {
  audioEnd,
  frameStart,
  layoutOf,
  MICROS_PER_SECOND,
  nearestFrame,
  projectEnd,
  RULE_14,
  type FrameRate,
  type Micros,
  type Project,
} from '../core';

/** The ruler of an empty project spans one minute (SCR-Editor "empty" board). */
export const EMPTY_SPAN: Micros = 60 * MICROS_PER_SECOND;

/** Pixels per microsecond that fit `end` (or the empty span) into `width` pixels. */
export function fitScale(width: number, end: Micros): number {
  return Math.max(0, width) / (end > 0 ? end : EMPTY_SPAN);
}

export interface ClipBox {
  readonly id: string;
  readonly index: number;
  readonly start: Micros;
  /** Exclusive. */
  readonly end: Micros;
  /** Left edge and width in pixels. */
  readonly x: number;
  readonly width: number;
  /** The cross-fade with the previous clip (overlapping this clip's start), and into the next one. */
  readonly crossFadeIn: Micros;
  readonly crossFadeOut: Micros;
}

/** The main track's clips as boxes at `scale` (INV-03). */
export function clipBoxes(project: Project, scale: number): ClipBox[] {
  const rate = project.frame.frameRate;
  const { spans } = layoutOf(project);
  return project.clips.map((clip, index) => {
    const span = spans[index]!;
    const start = frameStart(span.startFrame, rate);
    const end = frameStart(span.endFrame, rate);
    const previous = index > 0 ? spans[index - 1]! : null;
    return {
      id: clip.id,
      index,
      start,
      end,
      x: start * scale,
      width: (end - start) * scale,
      crossFadeIn: previous ? frameStart(previous.crossFadeFrames, rate) : 0,
      crossFadeOut: frameStart(span.crossFadeFrames, rate),
    };
  });
}

/** Label steps of the ruler, in seconds: round m:ss values. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export interface RulerTicks {
  /** Between labels. */
  readonly step: Micros;
  /** Labelled times, from 0 to the span. */
  readonly labels: readonly Micros[];
  /** Unlabelled ticks between labels. */
  readonly minor: readonly Micros[];
}

/** The ruler: labels at the smallest round step at least `minGap` pixels apart, with minor ticks between. */
export function rulerTicks(span: Micros, scale: number, minGap: number): RulerTicks {
  const seconds = STEPS.find((s) => s * MICROS_PER_SECOND * scale >= minGap) ?? STEPS[STEPS.length - 1]!;
  const step = seconds * MICROS_PER_SECOND;
  const parts = seconds % 5 === 0 ? 5 : 2;
  const labels: Micros[] = [];
  const minor: Micros[] = [];
  for (let t = 0; t <= span; t += step) {
    labels.push(t);
    for (let k = 1; k < parts; k++) {
      const m = t + (step * k) / parts;
      if (m < span) minor.push(Math.round(m));
    }
  }
  return { step, labels, minor };
}

/**
 * RULE-05 reorder: the clip boundary nearest `x` (0 = before the first clip, n = after the last). Where a
 * cross-fade overlaps two clips, their boundary is the middle of the overlap.
 */
export function boundaryAt(boxes: readonly ClipBox[], x: number): number {
  const edges = boxes.map((b, i) => (i === 0 ? 0 : (b.x + boxes[i - 1]!.x + boxes[i - 1]!.width) / 2));
  const last = boxes[boxes.length - 1];
  edges.push(last ? last.x + last.width : 0);
  let best = 0;
  edges.forEach((e, i) => {
    if (Math.abs(e - x) < Math.abs(edges[best]! - x)) best = i;
  });
  return best;
}

/**
 * The index in the resulting order (MOD-Project `moveClip`) of clip `from` dropped at `boundary`, or
 * null when that boundary is next to the clip itself (no move).
 */
export function moveTarget(from: number, boundary: number): number | null {
  if (boundary === from || boundary === from + 1) return null;
  return boundary > from ? boundary - 1 : boundary;
}

/** The time under `x` pixels from the track's start, within the project. */
export function timeAt(x: number, scale: number, end: Micros): Micros {
  if (scale <= 0) return 0;
  return Math.min(end, Math.max(0, Math.round(x / scale)));
}

/** CMP-Timeline: under 48 px of width a clip shows its duration only (its name moves to the tooltip). */
export const MIN_NAMED_WIDTH = 48;
export const labelFits = (width: number): boolean => width >= MIN_NAMED_WIDTH;

/** An audio clip on the audio lane at a scale (F-011): it may run past the project end (INV-07). */
export interface AudioBox {
  readonly id: string;
  readonly start: Micros;
  /** Exclusive: the clip's own end, wherever the project ends. */
  readonly end: Micros;
  readonly x: number;
  readonly width: number;
  /** Pixels from the box's left edge where the project ends inside it (the hatched rest), or null. */
  readonly pastEndX: number | null;
}

/** Implements: CMP-Timeline "wide / default" (the audio clip past the project end, INV-07), F-011.R2. */
export function audioBoxes(project: Project, scale: number): AudioBox[] {
  const end = frameStart(layoutOf(project).frames, project.frame.frameRate);
  return project.audioClips.map((a) => {
    const stop = a.start + (a.out - a.in);
    return {
      id: a.id,
      start: a.start,
      end: stop,
      x: a.start * scale,
      width: (stop - a.start) * scale,
      pastEndX: stop > end && project.clips.length > 0 ? Math.max(0, (end - a.start) * scale) : null,
    };
  });
}

/**
 * F-011.R2: the start an audio clip dragged by `dx` pixels asks for — its start moved by the drag, at
 * the nearest frame start, never before 0. MOD-Project's RULE-12 move rule then places it.
 */
export function audioDragStart(start: Micros, dx: number, scale: number, rate: FrameRate): Micros {
  if (scale <= 0) return start;
  const t = Math.max(0, Math.round(start + dx / scale));
  return frameStart(nearestFrame(t, rate), rate);
}

/** F-004: the time under `x` pixels from the track's start, not limited to the project (a trimmed end may pass it). */
export function pointerTime(x: number, scale: number): Micros {
  if (scale <= 0) return 0;
  return Math.max(0, Math.round(x / scale));
}

/** An item's place on the timeline: a main-track clip, text layer or audio clip (end exclusive). */
export interface ItemSpan {
  readonly kind: 'clip' | 'text' | 'audio';
  readonly start: Micros;
  readonly end: Micros;
}

/** F-004: where item `id` is on the timeline, or null when there is no such item. */
export function itemSpan(project: Project, id: string): ItemSpan | null {
  const rate = project.frame.frameRate;
  const i = project.clips.findIndex((c) => c.id === id);
  if (i >= 0) {
    const span = layoutOf(project).spans[i]!;
    return { kind: 'clip', start: frameStart(span.startFrame, rate), end: frameStart(span.endFrame, rate) };
  }
  const layer = project.textLayers.find((t) => t.id === id);
  if (layer) return { kind: 'text', start: layer.start, end: layer.end };
  const a = project.audioClips.find((x) => x.id === id);
  if (a) return { kind: 'audio', start: a.start, end: audioEnd(a) };
  return null;
}

/**
 * Implements: RULE-14 snapping (F-004.R4) — the times a trimmed edge of item `id` snaps to: time 0, the
 * playhead, the project end and the starts and ends of the other clips, text layers and audio clips.
 * What moves with the edge is left out: for a main-track clip, the clips after it and the project end
 * (INV-03 keeps them joined to it); the item's own edges always.
 */
export function trimSnapTargets(project: Project, id: string, playhead: Micros): Micros[] {
  const rate = project.frame.frameRate;
  const { spans } = layoutOf(project);
  const index = project.clips.findIndex((c) => c.id === id);
  const main = index >= 0;
  const out: Micros[] = [0, playhead];
  if (!main && project.clips.length) out.push(projectEnd(project));
  spans.forEach((span, i) => {
    if (main && i >= index) return;
    out.push(frameStart(span.startFrame, rate), frameStart(span.endFrame, rate));
  });
  for (const t of project.textLayers) if (t.id !== id) out.push(t.start, t.end);
  for (const a of project.audioClips) if (a.id !== id) out.push(a.start, audioEnd(a));
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Implements: RULE-14 — the target within `px` screen pixels of `t` nearest to it (the earlier one on a
 * tie), or null when none is that close.
 */
export function snapTime(
  t: Micros,
  targets: readonly Micros[],
  scale: number,
  px: number = RULE_14.snapPx,
): Micros | null {
  if (scale <= 0) return null;
  let best: Micros | null = null;
  for (const target of targets) {
    const d = Math.abs(target - t) * scale;
    if (d > px) continue;
    if (best === null || d < Math.abs(best - t) * scale) best = target;
  }
  return best;
}
