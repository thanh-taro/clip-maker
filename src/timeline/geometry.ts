// MOD-Timeline — pure geometry of CMP-Timeline: the scale that fits the project, the main-track clip
// boxes (INV-03: end to end from 0, a cross-fade overlapping both neighbours by its duration), the ruler
// ticks, the clip boundary nearest a drop point (RULE-05 reorder) and the time under the pointer.
// Implements: CMP-Timeline "wide / default" (clip widths equal duration × the ruler scale), RULE-05
// reorder target, F-002.R3 (the ruler's time under the pointer), F-003.R2. F-004 adds an item's span, the
// time under a trim drag and RULE-14 snapping of a trimmed edge (F-004.R4). F-013 adds RULE-14's zoom range
// and steps, the scroll that keeps a time under a point, following the playhead, the ruler at frame zoom
// (windowed to the view) and snapping of a moved item and of the scrubbed playhead (F-013.R1–R3).
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
/** CMP-Timeline "frames": steps between numbered frames, and the least room a frame number takes. */
const FRAME_STEPS = [1, 2, 3, 5, 6, 10, 15];
const FRAME_GAP_PX = 20;
/** No frame number this close after a second's m:ss label (the label's room). */
const SECOND_LABEL_PX = 36;
/** Ticks at every frame once a frame is this wide. */
const FRAME_TICK_PX = 4;

export interface RulerTicks {
  /** Between labels. */
  readonly step: Micros;
  /** Labelled times (m:ss), from 0 (or the window's start) to the span. */
  readonly labels: readonly Micros[];
  /** Unlabelled ticks between labels. */
  readonly minor: readonly Micros[];
  /** CMP-Timeline "frames": muted frame numbers between the seconds (`n`: the frame within its second). */
  readonly frames: readonly { readonly at: Micros; readonly n: number }[];
}

/** The part of the ruler to make (the view and a margin around it), and the frame rate for frame numbers. */
export interface RulerWindow {
  readonly from: Micros;
  readonly to: Micros;
  readonly rate?: FrameRate;
}

/**
 * The ruler: labels at the smallest round step at least `minGap` pixels apart, with minor ticks between.
 * At frame zoom (a 1 s step and room for frame numbers), the frames between the seconds are numbered
 * (CMP-Timeline "frames"). With a `window`, only the ticks within it are made (a 10-minute project at frame
 * zoom would otherwise make tens of thousands, NFR-03).
 */
const labelSeconds = (scale: number, minGap: number): number =>
  STEPS.find((s) => s * MICROS_PER_SECOND * scale >= minGap) ?? STEPS[STEPS.length - 1]!;

/**
 * CMP-Timeline "frames": every how many frames the ruler numbers them at `scale`, or undefined when it shows
 * no frame numbers (labels a second apart, and room for a number between them).
 */
export function frameLabelStep(scale: number, rate: FrameRate, minGap: number): number | undefined {
  if (labelSeconds(scale, minGap) !== 1) return undefined;
  const fp = framePx(scale, rate);
  return FRAME_STEPS.find((n) => n < rate && n * fp >= FRAME_GAP_PX);
}

export function rulerTicks(span: Micros, scale: number, minGap: number, window?: RulerWindow): RulerTicks {
  const seconds = labelSeconds(scale, minGap);
  const step = seconds * MICROS_PER_SECOND;
  const from = window ? Math.max(0, Math.floor(window.from / step) * step) : 0;
  const to = window ? Math.min(span, window.to) : span;
  const rate = window?.rate;
  const fp = rate ? framePx(scale, rate) : 0;
  const k = rate ? frameLabelStep(scale, rate, minGap) : undefined;
  const parts = seconds % 5 === 0 ? 5 : 2;
  const labels: Micros[] = [];
  const minor: Micros[] = [];
  const frames: { at: Micros; n: number }[] = [];
  for (let t = from; t <= to; t += step) {
    labels.push(t);
    if (rate && k !== undefined) {
      const first = Math.round((t / MICROS_PER_SECOND) * rate);
      const every = fp >= FRAME_TICK_PX ? 1 : k;
      for (let n = every; n < rate; n += every) {
        const at = frameStart(first + n, rate);
        if (at >= span) break;
        minor.push(at);
        if (n % k === 0 && (at - t) * scale >= SECOND_LABEL_PX) frames.push({ at, n });
      }
      continue;
    }
    for (let j = 1; j < parts; j++) {
      const m = t + (step * j) / parts;
      if (m < span) minor.push(Math.round(m));
    }
  }
  return { step, labels, minor, frames };
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

// ── F-013: zoom, scroll and follow (RULE-14) ─────────────────────────────────────────────────────────

/** Width in screen pixels of the shortest frame at `scale` (frames are floor-rounded microseconds). */
export function framePx(scale: number, rate: FrameRate): number {
  return scale * Math.floor(MICROS_PER_SECOND / rate);
}

/** RULE-14: the scale at which one frame is `minFramePx` screen pixels wide (zoomed in fully). */
export function maxScale(rate: FrameRate): number {
  const frame = Math.floor(MICROS_PER_SECOND / rate);
  const scale = RULE_14.minFramePx / frame;
  // Never a hair under 12 px through rounding (F-013.AC1 says at least).
  return scale * frame < RULE_14.minFramePx ? scale * (1 + 4 * Number.EPSILON) : scale;
}

export interface ZoomRange {
  /** The whole project in the view (fit). */
  readonly min: number;
  /** One frame at least 12 px wide, or the fit when that already is. */
  readonly max: number;
}

/** Implements: RULE-14 *Zoom* — from showing the whole project (`fit`) to one frame being at least 12 px wide. */
export function zoomRange(fit: number, rate: FrameRate): ZoomRange {
  return { min: fit, max: Math.max(fit, maxScale(rate)) };
}

export const clampScale = (scale: number, range: ZoomRange): number => Math.min(range.max, Math.max(range.min, scale));

/** Each zoom control step doubles or halves the scale. */
export const ZOOM_STEP = 2;
/** A step that lands this close to an end of the range goes to it. */
const ZOOM_EPSILON = 1e-6;

/** F-013.R1: the scale one Zoom in (`dir` 1) or Zoom out (−1) step away, within the range. */
export function zoomedScale(scale: number, dir: 1 | -1, range: ZoomRange): number {
  const next = clampScale(dir > 0 ? scale * ZOOM_STEP : scale / ZOOM_STEP, range);
  if (Math.abs(next - range.min) <= range.min * ZOOM_EPSILON) return range.min;
  if (Math.abs(next - range.max) <= range.max * ZOOM_EPSILON) return range.max;
  return next;
}

/**
 * RULE-14 D-013: on touch the playhead sits at the view's centre and the project can scroll from its start to
 * its end under it, so fitting puts the whole project in half the view: it then shows wherever the playhead is.
 */
export function centredFit(viewWidth: number, end: Micros): number {
  return Math.max(0, viewWidth) / 2 / (end > 0 ? end : EMPTY_SPAN);
}

/** The time at view x `x` (pixels from the view's left) with the lanes scrolled by `scroll` and time 0 at `pad`. */
export function scrollTimeAt(x: number, scroll: number, pad: number, scale: number): Micros {
  return scale > 0 ? (x + scroll - pad) / scale : 0;
}

/** The scroll that puts time `t` at view x `x` (a zoom anchor; F-013.AC4: the pinch point). */
export function anchoredScroll(t: Micros, x: number, pad: number, scale: number): number {
  return pad + t * scale - x;
}

/** While following, the playhead turns a page this close to the view's right edge… */
const FOLLOW_EDGE_PX = 16;
/** …and lands this far from its left edge (at most an eighth of the view). */
const FOLLOW_LEAD_PX = 64;

/**
 * Implements: RULE-14 *During playback* (F-013.R2, F-013.AC2) — with the playhead at content x `headX` and the
 * view scrolled by `scroll`, the scroll that keeps it visible: null while it is inside the view; at (or past)
 * the right edge, or behind the left edge, a page turn that puts it near the left edge.
 */
export function followScroll(headX: number, scroll: number, viewWidth: number): number | null {
  if (headX >= scroll && headX <= scroll + viewWidth - FOLLOW_EDGE_PX) return null;
  return Math.max(0, headX - Math.min(FOLLOW_LEAD_PX, viewWidth / 8));
}

// ── RULE-14 snapping of moves and of the playhead (F-013.R3) ───────────────────────────────────────

/**
 * Implements: RULE-14 — a moved item snaps by its start or its end (F-013.R3), whichever is nearer a target
 * within `px` screen pixels. Returns the change to its time and the target, or null.
 */
export function moveSnap(
  start: Micros,
  end: Micros,
  targets: readonly Micros[],
  scale: number,
  px: number = RULE_14.snapPx,
): { readonly delta: Micros; readonly at: Micros } | null {
  const a = snapTime(start, targets, scale, px);
  const b = snapTime(end, targets, scale, px);
  if (a === null && b === null) return null;
  if (b === null || (a !== null && Math.abs(a - start) <= Math.abs(b - end))) return { delta: a! - start, at: a! };
  return { delta: b - end, at: b };
}

/** RULE-14: what the scrubbed playhead snaps to — time 0, the project end and every item's start and end. */
export function playheadSnapTargets(project: Project): Micros[] {
  const rate = project.frame.frameRate;
  const out: Micros[] = [0];
  if (project.clips.length) out.push(projectEnd(project));
  for (const span of layoutOf(project).spans)
    out.push(frameStart(span.startFrame, rate), frameStart(span.endFrame, rate));
  for (const t of project.textLayers) out.push(t.start, t.end);
  for (const a of project.audioClips) out.push(a.start, audioEnd(a));
  return [...new Set(out)].sort((a, b) => a - b);
}
