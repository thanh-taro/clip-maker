// MOD-App — trimming and splitting (F-004): what Split, Start here and End here act on and when they are
// available, the actions behind the timeline's toolbar, the phone Edit sheet and the RULE-20 keys (S or
// Mod+B, I, O), and the trim drag of MOD-Timeline's handles as one coalesced gesture (RULE-13). The rule
// maths is MOD-Project's `splitAt` and `trimTo` (RULE-05, RULE-10, RULE-12, RULE-03); refusals and
// shortenings show as CMP-Notice.
// Implements: F-004.R1 (trim a clip's start or end), F-004.R2 (split the selected clip, else the
// main-track clip under the playhead), F-004.R3 (text layers and audio clips the same way), F-004.R6
// (Start here / End here without dragging), RULE-20 (S, Mod+B, I, O), RULE-21 (trim drag → start-here
// and end-here controls), SCR-Editor "Unavailable controls" (split unless a main-track clip is under the
// playhead).
import { computed } from '@preact/signals';
import { frameIndexAt, layoutOf, type Micros, type Notice, type Project } from '../core';
import { beginGesture, edit, playhead, project, selection, splitAt, trimTo } from '../project';
import { itemSpan } from '../timeline';
import { nextItemId, showResultNotices } from './adding';

/** The selected item (a main-track clip, text layer or audio clip), if any. */
const selectedItem = computed<string | null>(() => {
  const id = selection.value[0];
  return id !== undefined && itemSpan(project.value, id) ? id : null;
});

/**
 * The main-track clip under time `t` (a frame start): the clip whose frames hold it; inside a
 * cross-fade, the later of the two clips (the one that is starting). Null at or past the project end.
 */
export function clipUnder(p: Project, t: Micros): string | null {
  const k = frameIndexAt(Math.max(0, t), p.frame.frameRate);
  const spans = layoutOf(p).spans;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]!;
    if (s.startFrame <= k && k < s.endFrame) return p.clips[i]!.id;
  }
  return null;
}

/**
 * F-004.R2 / RULE-20 S: what Split acts on — the selected item, else the main-track clip under the
 * playhead. A selected item is a target only while the playhead is within it, ends included (a split too
 * close to an edge then shows COPY-notice.split_too_close, F-004.AC4); outside it Split is unavailable
 * (build question 122).
 */
export const splitTarget = computed<string | null>(() => {
  const id = selectedItem.value;
  if (id === null) return clipUnder(project.value, playhead.value);
  const span = itemSpan(project.value, id)!;
  const rate = project.value.frame.frameRate;
  const k = frameIndexAt(playhead.value, rate);
  return frameIndexAt(span.start, rate) <= k && k <= frameIndexAt(span.end, rate) ? id : null;
});

/** Whether the playhead is strictly inside the selected item: where its start or end can be set. */
const playheadInside = computed<boolean>(() => {
  const id = selectedItem.value;
  const span = id ? itemSpan(project.value, id) : null;
  if (!span) return false;
  const rate = project.value.frame.frameRate;
  const k = frameIndexAt(playhead.value, rate);
  return frameIndexAt(span.start, rate) < k && k < frameIndexAt(span.end, rate);
});

/**
 * SCR-Editor "Unavailable controls" and CMP-Timeline "wide / default": without a selection only Split is
 * available, and only when a main-track clip is under the playhead. Start here and End here need a
 * selected item with the playhead inside it (build question 122).
 */
export const trimAvailable = computed(() => ({
  split: splitTarget.value !== null,
  setIn: playheadInside.value,
  setOut: playheadInside.value,
}));

/** Runs one edit; false when nothing changed (refused, or nothing to do). */
function commit(op: Parameters<typeof edit>[0]): boolean {
  const before = project.peek();
  showResultNotices(edit(op));
  return project.peek() !== before;
}

/**
 * F-004.R2: split the selected item (else the main-track clip under the playhead) at the playhead, as one
 * step. Too close to an edge: nothing changes and COPY-notice.split_too_close shows (F-004.AC4). The
 * selection stays on the first part.
 */
export function splitHere(): boolean {
  const id = splitTarget.peek();
  if (!id) return false;
  const t = playhead.peek();
  return commit((p) => splitAt(p, id, t, nextItemId));
}

/** F-004.R6: Start here (`start`) or End here (`end`) — trim the selected item at the playhead, one step. */
export function trimHere(edge: 'start' | 'end'): boolean {
  const id = selectedItem.peek();
  if (!id || !playheadInside.peek()) return false;
  const t = playhead.peek();
  return commit((p) => trimTo(p, id, edge, t));
}

/** A trim drag of one edge (MOD-Timeline's handles): every move is part of one undo step. */
export interface TrimSession {
  /**
   * The edge asks for time `t` (already snapped); measured against the project as the drag began. At the
   * edge's own starting time the project is put back as it was (Esc, or a drag back).
   */
  to(t: Micros): void;
  /** The drag is over: the step is complete and (unless `notify` is false) its last notices show. */
  end(notify?: boolean): void;
  /** False once ended, or once undo, redo or New project cut the gesture. */
  readonly active: boolean;
}

/**
 * Implements: F-004.R1/R3/R4, RULE-13 (one continuous drag is one step; F-014 `beginGesture(onCut)`).
 * Each move trims the project as it was when the drag began, so the edge follows the pointer and a drag
 * back to where it started leaves no step. `onCut` runs when undo, redo or New project cut the drag (the
 * view then ends it). Notices (COPY-notice.length_limited, …) show once, at the end.
 */
export function beginTrim(id: string, edge: 'start' | 'end', onCut: () => void): TrimSession {
  const base = project.peek();
  const span = itemSpan(base, id);
  // The edge back where it began is the project as it was (never a re-rounded copy of it).
  const origin = span ? (edge === 'start' ? span.start : span.end) : null;
  let ended = false;
  let notices: readonly Notice[] = [];
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  return {
    to(t) {
      if (ended || !gesture.active) return;
      notices = gesture.edit(() =>
        t === origin ? { project: base, notices: [], changed: [] } : trimTo(base, id, edge, t),
      );
    },
    end(notify = true) {
      if (ended) return;
      ended = true;
      gesture.end();
      if (notify) showResultNotices(notices);
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}
