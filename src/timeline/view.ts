// MOD-Timeline — the imperative view of CMP-Timeline (ADR-0002 §1: pointer moves, scrubbing and playback
// ticks never re-render Preact). Built here (F-003): the ruler with m:ss labels that can be scrubbed (the
// F-002 playhead binding), the playhead, the project-end marker, and the main track's clips with their
// thumbnails, names, lengths and cross-fade markers; selecting a clip; moving a clip by dragging it to the
// nearest clip boundary (RULE-05; on touch after holding it for 0.4 s, RULE-21). Zoom, scroll and the
// centre-fixed touch playhead (F-013, F-017), trim handles (F-004), the cross-fade popover (F-009) and the
// text lane (F-010) comes with its feature. F-011 adds the audio lane: each audio clip with its title chip
// and waveform band, the part past the project end hatched (INV-07), selecting it, and moving it by
// dragging (on touch after the 0.4 s hold) to the start MOD-Project's RULE-12 move rule picks.
// Implements: F-003.R1, F-003.R2 (drag), F-002.R3 (scrub on the ruler), CMP-Timeline anatomy and
// accessibility (items focusable in order, named by their name and duration), RULE-21 hold-and-drag,
// F-011.R2 (move an audio clip; it never overlaps another, INV-06), CMP-Timeline "audio item".
// F-004 adds the trim handles on the selected clip or audio clip (CMP-Timeline "trimming"): neutral end tabs
// whose drag trims the item's start or end as one gesture (one undo step), with the length / end readout
// and the dashed snap line while the edge snaps (RULE-14, within 8 screen pixels). The scale holds still
// during a trim, so the edge stays under the pointer. Implements: F-004.R1, F-004.R3 (audio clips; the
// text lane comes with F-010), F-004.R4, RULE-21 (dragging a trim handle trims; no hold).
// F-009 adds the join controls (CMP-Timeline "cross-fade"): at each join of two main-track clips, the dashed
// add chip (shown on hover, focus or with either clip selected; unavailable with its reason between clips too
// short) or, over a cross-fade's band, the bow-tie marker that opens MOD-App's length popover (its expanded
// state follows `crossFade.open`). They come after the clips in focus order and keep their element (and focus)
// across edits. Implements: F-009.R2, F-009.R7, CMP-Timeline "Accessibility" (the marker's expanded state).
// F-010 adds the text lane between the main track and the audio lane: each text layer at its times, showing its
// text (`trackText`), later layers stacked on top; selecting it; its trim handles (the F-004 drag); moving it in
// time by dragging (on touch after the 0.4 s hold, RULE-21); activating the selected item again, or a
// double-click, opens CMP-TextEditor on it. The part past the project end is hatched (INV-07). Implements:
// F-010.R4 (start and end on the timeline), F-004.R3 (text layers trimmed the same way), CMP-Timeline "text
// item", RULE-21.
// F-013 adds zoom and scroll: the lanes scroll (`host` is the scroller, `content` the lanes at the zoomed
// width), from fitting the whole project to one frame being 12 px wide (RULE-14); Zoom in / Zoom out / Fit, a
// two-finger pinch around the pinch point, Ctrl/⌘ + wheel; the ruler numbers frames at frame zoom and only
// the part near the view is made, and thumbnail strips are drawn for the part near the view (NFR-03, NFR-05).
// With a pointer the view follows the playhead during playback until a manual scroll, and again once playback
// restarts or the playhead is back in view. On narrow layouts (D-013) the playhead stays at the view's centre
// and scrolling moves the project under it: the scroll position is the playhead, so a one-finger drag (with
// momentum ending on a frame start) scrubs, pausing playback first. RULE-14 snapping can be turned off
// (`signals.snapping`); while on, a moved text layer or audio clip snaps by its start or end and a scrubbed
// playhead snaps to the items' edges. Implements: F-013.R1–R4, RULE-14, RULE-21 (pinch, one-finger scroll),
// CMP-Timeline "frames" and "narrow / no sheet".
import { batch, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import {
  frameStart,
  nearestFrame,
  projectEnd,
  type AudioClip,
  type Clip,
  type Micros,
  type Project,
  type TextLayer,
} from '../core';
import {
  EMPTY_SPAN,
  anchoredScroll,
  audioBoxes,
  audioDragStart,
  boundaryAt,
  centredFit,
  clampScale,
  clipBoxes,
  fitScale,
  followScroll,
  frameLabelStep,
  framePx,
  itemSpan,
  labelFits,
  moveSnap,
  moveTarget,
  playheadSnapTargets,
  pointerTime,
  rulerTicks,
  scrollTimeAt,
  snapTime,
  timeAt,
  trimSnapTargets,
  zoomRange,
  zoomedScale,
  type ClipBox,
  type ZoomRange,
} from './geometry';

export interface TimelineSignals {
  readonly project: ReadonlySignal<Project>;
  readonly selection: ReadonlySignal<readonly string[]>;
  /** The session's one playhead (MOD-Project); the preview follows it (F-002 binding). */
  readonly playhead: Signal<Micros>;
  /**
   * F-013.R1: the zoom the user chose, in pixels per microsecond, or null to fit the project. MOD-App keeps it
   * across New project (RULE-23); the view clamps it to RULE-14's range.
   */
  readonly zoom?: Signal<number | null>;
  /** F-013.R3: RULE-14 snapping is on (default on). */
  readonly snapping?: ReadonlySignal<boolean>;
  /** F-013.R2: playback is running (the view follows the playhead). */
  readonly playing?: ReadonlySignal<boolean>;
}

/** F-013: what the zoom controls show (CMP-Timeline toolbar, the narrow zoom pill). */
export interface TimelineNav {
  /** Zoom in is available (not at RULE-14's maximum, and the project has clips). */
  readonly canZoomIn: boolean;
  /** Zoom out and Fit are available (zoomed in past the fit). */
  readonly canZoomOut: boolean;
  /** CMP-Timeline "frames": the width of one frame in pixels while frames are numbered, else null. */
  readonly framePx: number | null;
  /** D-013: the playhead stays at the centre (narrow layouts). */
  readonly centred: boolean;
}

/** What the view needs from the app: words (MOD-Copy), pictures (MOD-Media) and the edit actions. */
export interface TimelineDeps {
  /** A clip's name (its source's file name). */
  name(clip: Clip): string;
  /** A length or time as m:ss in the active language (read inside the view's effects, so they follow it). */
  time(us: Micros): string;
  /** COPY-timeline.project_end. */
  endLabel(): string;
  /** COPY-drop.hint, in the empty main track. */
  emptyHint(): string;
  /** COPY-timeline.main_track: the name of the main track's group of clips. */
  trackLabel(): string;
  /** F-002.R8: the time ruler's name as a slider (COPY-timeline.ruler). */
  rulerLabel?(): string;
  /** F-002.R8: the ruler's value read aloud: the playhead time with the project length (COPY-time.position). */
  rulerValue?(t: Micros, end: Micros): string;
  /** The picture drawn along a clip: a video's first frame, a photo; null when there is none. */
  picture(sourceId: string): Promise<CanvasImageSource | null>;
  select(id: string | null): void;
  /** Move clip `id` to index `to` of the resulting order (one undo step). */
  move(id: string, to: number): void;
  /** An audio clip's title: its source's name, or the bundled track's title (F-011). */
  audioName?(clip: AudioClip): string;
  /** Move audio clip `id` to start at `start`; MOD-Project's RULE-12 move rule places it (F-011.R2). */
  moveAudio?(id: string, start: Micros): void;
  /** F-010: what a text item shows and is named by (its text on one line). */
  textName?(layer: TextLayer): string;
  /** F-010: move text layer `id` by `frames` frames in time (one undo step; a drag on the text lane). */
  moveText?(id: string, frames: number): void;
  /** F-010: open CMP-TextEditor on text layer `id` (a double-click, or activating the selected item again). */
  editText?(id: string): void;
  /** A scrub on the ruler starts (playback keeps the latest time, F-002.R3). */
  scrubStart?(): void;
  /**
   * F-004: a drag of item `id`'s start or end edge begins; every move goes through the returned drag as one
   * undo step. `onCut` runs when undo, redo or New project cut it (the view then ends the drag).
   */
  trim?(id: string, edge: 'start' | 'end', onCut: () => void): TrimDrag;
  /** F-004.R4: the trim readout's two parts, COPY-timeline.length and COPY-timeline.ends_at. */
  trimReadout?(length: Micros, end: Micros): readonly [length: string, ends: string];
  /** F-009: the cross-fade controls at each join (CMP-Timeline "cross-fade"); none without it. */
  crossFade?: CrossFadeDeps;
}

/** F-009: what a join between two main-track clips shows and does (MOD-App's fades module). */
export interface CrossFadeDeps {
  /** The join after clip `id`: its cross-fade (`label` names the control) or why one can't be added. */
  join(p: Project, id: string): { readonly on: boolean; readonly label: string; readonly reason: string | null };
  /** The join whose popover is open (its marker shows the expanded state). */
  readonly open: ReadonlySignal<string | null>;
  /** The add chip was activated (adds 0.5 s, or shows the reason it can't). */
  add(id: string): void;
  /** The marker was activated: open (or close) its popover. */
  toggle(id: string): void;
}

/** F-004: one trim drag as MOD-App runs it (its moves coalesce into one RULE-13 step). */
export interface TrimDrag {
  /** The edge asks for timeline time `t` (already snapped). */
  to(t: Micros): void;
  /** `notify`: show the trim's notices (false when the drag was stopped by another change). */
  end(notify?: boolean): void;
  readonly active: boolean;
}

export interface TimelineView {
  /** Focus the clip at `index` (the nearest one that exists), or the track when there is none. */
  focusClip(index: number): void;
  /** F-013.R1: one zoom step in or out, around the playhead when it is in view (else the view's centre). */
  zoomIn(): void;
  zoomOut(): void;
  /** F-013.R1: fit the whole project in the view. */
  fit(): void;
  /** F-013.R2: bring the playhead into view and follow it again. */
  scrollToPlayhead(): void;
  /** F-013: the state of the zoom controls. */
  readonly nav: ReadonlySignal<TimelineNav>;
  dispose(): void;
}

/** RULE-21: press and hold for 0.4 s, then drag, moves a clip on touch. */
export const HOLD_MS = 400;
/** A pointer that moves this far before the hold ends scrolls instead (touch), or starts a drag (mouse). */
const DRAG_SLOP_PX = 6;
/** F-010: rows of the text lane for layers that overlap in time (more share the last row). */
const TEXT_ROWS = 3;
/** Ruler labels at least this far apart. */
const LABEL_GAP_PX = 56;
/** F-009: the add chip shows while the pointer is this close to its join. */
const JOIN_HOVER_PX = 20;
/** Ruler labels this close to the playhead hide under its head (D-039). */
const HEAD_CLEAR_PX = 14;
/** F-002.R8: the ruler slider's steps: the arrow keys and the Page keys. */
const RULER_STEP_US = 1_000_000;
const RULER_PAGE_US = 10_000_000;
/** F-013: the touch scroll's momentum (per 16 ms) and the speed (px/ms) where it stops. */
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_STOP = 0.05;
/** F-013: Ctrl/⌘ + wheel zooms by e^(−deltaY × this). */
const WHEEL_ZOOM = 0.01;

const SVG = 'http://www.w3.org/2000/svg';

/** Decorative: hidden from assistive technology (the items carry the names). */
const decorative = (e: Element): void => e.setAttribute('aria-hidden', String(true));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * The join control's glyphs (board CMP-Timeline "cross-fade"): the cross-fade marker's bow-tie (style.md
 * "Cross-fade marker": never an ×) and the dashed add chip's plus.
 */
const GLYPHS = { marker: 'M4 6v12l8-6zM20 6v12l-8-6z', add: 'M12 5v14M5 12h14' } as const;
function glyph(kind: keyof typeof GLYPHS): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  decorative(svg);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', GLYPHS[kind]);
  svg.appendChild(path);
  return svg;
}

/** F-009: a join's control (the add chip or the marker) and the hidden reason it is unavailable. */
interface JoinEls {
  readonly button: HTMLButtonElement;
  readonly reason: HTMLSpanElement;
  state: 'add' | 'marker' | '';
}

/** Keeps a pointer's moves on `target` (a pointer that is no longer down can't be captured). */
function capture(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // The pointer went up already: nothing to keep.
  }
}

interface ClipEls {
  readonly button: HTMLButtonElement;
  readonly name: HTMLSpanElement;
  readonly length: HTMLSpanElement;
  /** The band the thumbnails fill; the canvas covers only its part near the view (F-013, NFR-05). */
  readonly film: HTMLSpanElement;
  readonly strip: HTMLCanvasElement;
  drawn: string;
  /** The part of the clip (pixels from its left) the canvas covers, or null when none is near the view. */
  win: readonly [number, number] | null;
}

/** F-004: a trim handle being dragged. */
interface Trim {
  readonly id: string;
  readonly edge: 'start' | 'end';
  readonly lane: 'clip' | 'text' | 'audio';
  readonly pointerId: number;
  readonly touch: boolean;
  readonly startX: number;
  /** The edge's time when the drag began. */
  readonly from: Micros;
  /** The scale when the drag began: it holds still until the drag ends. */
  readonly scale: number;
  /** The project as the drag began: snap targets are its items' edges (the playhead is read live). */
  readonly base: Project;
  session: TrimDrag | null;
}

interface Drag {
  /** A main-track clip, an audio clip (F-011) or a text layer (F-010). */
  readonly kind: 'clip' | 'audio' | 'text';
  readonly id: string;
  readonly index: number;
  readonly pointerId: number;
  readonly startX: number;
  readonly touch: boolean;
  /** The drag has started (moved past the slop, or held on touch). */
  active: boolean;
  /** A touch moved before the hold ended: it scrolls. */
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  boundary: number | null;
  /** Pixels moved so far (audio clips take their requested start from it). */
  dx: number;
}

/** A one-finger scroll (touch), or a mouse drag on the centred ruler. */
interface Pan {
  readonly id: number;
  readonly mouse: boolean;
  readonly onRuler: boolean;
  readonly startX: number;
  readonly startScroll: number;
  readonly startTime: Micros;
  readonly startHead: Micros;
  moved: boolean;
  /** Recent positions, for the momentum on release. */
  samples: { x: number; at: number }[];
}
/** A two-finger pinch (RULE-21). */
interface Pinch {
  readonly a: number;
  readonly b: number;
  readonly startDist: number;
  readonly startZoom: number | null;
  readonly startScale: number;
  readonly startScroll: number;
  readonly startTime: Micros;
  readonly startHead: Micros;
  /** The time under the fingers' midpoint when the pinch began: it stays under it (F-013.AC4). */
  readonly anchorT: Micros;
}

/**
 * Mounts CMP-Timeline's lanes into `host` (the region, its toolbar and the lane gutter are MOD-App's
 * chrome). `host` becomes the lanes' scroller (F-013); a narrow layout tells the view to keep the playhead
 * at the centre by setting `--tk-tl-centred: 1` on it (timeline.css). Returns the view's commands and its
 * unmount.
 */
export function mountTimeline(host: HTMLElement, signals: TimelineSignals, deps: TimelineDeps): TimelineView {
  const { project, selection, playhead } = signals;
  const zoom = signals.zoom ?? signal<number | null>(null);
  const snapping = signals.snapping ?? signal(true);
  const playing = signals.playing ?? signal(false);
  host.classList.add('tk-scroller');
  // The lanes at the zoomed width; `host` scrolls them (F-013).
  const content = el('div', 'tk-lanes', host);
  const ruler = el('div', 'tk-ruler', content);
  // F-002.R8 (QA-2): the ruler is the playhead's slider for keyboard and assistive technology; its labels and
  // ticks are presentational (a slider's children are).
  ruler.setAttribute('role', 'slider');
  ruler.setAttribute('aria-valuemin', '0');
  const track = el('div', 'tk-track', content);
  track.tabIndex = -1;
  // A group of the clips, named, so focus that lands here after the last clip was deleted is announced.
  track.setAttribute('role', 'group');
  const hint = el('span', 'tk-track__hint', track);
  const drop = el('span', 'tk-track__drop', track);
  decorative(drop);
  // F-010: the text lane between the main track and the audio lane (F-011).
  const textLane = el('div', 'tk-text-lane', content);
  const audioLane = el('div', 'tk-audio-lane', content);
  const end = el('span', 'tk-end', content);
  decorative(end);
  const endLabel = el('span', 'tk-end__label', end);
  const head = el('span', 'tk-playhead', content);
  decorative(head);
  el('span', 'tk-playhead__head', head);
  // F-004: the selected item's trim handles (moved into its lane), the snap line and the trim readout.
  const handles = (['start', 'end'] as const).map((edge) => {
    const h = el('span', `tk-trim tk-trim--${edge}`);
    h.dataset['edge'] = edge;
    // F-009: a handle answers clicks (it does nothing with them), so the browser's touch adjustment counts it as
    // a target and a touch on it is not moved to a join control nearby (CMP-Timeline "Accessibility").
    h.addEventListener('click', (e) => e.stopPropagation());
    decorative(h);
    return h;
  });
  const snapLine = el('span', 'tk-snap', content);
  decorative(snapLine);
  snapLine.hidden = true;
  const readout = el('div', 'tk-trim-readout', content);
  decorative(readout);
  const readLength = el('span', 'tk-trim-readout__length', readout);
  el('span', 'tk-trim-readout__sep', readout).textContent = '·';
  const readEnd = el('span', 'tk-trim-readout__end', readout);
  readout.hidden = true;

  /** The view's width and whether the playhead stays at its centre (narrow layouts, D-013). */
  const size = signal<{ readonly w: number; readonly centred: boolean }>({ w: 0, centred: false });
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth;
    const centred = getComputedStyle(host).getPropertyValue('--tk-tl-centred').trim() === '1';
    const now = size.peek();
    if (now.w !== w || now.centred !== centred) size.value = { w, centred };
  });
  resize.observe(host);

  const clips = new Map<string, ClipEls>();
  const audios = new Map<string, { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement }>();
  const texts = new Map<string, { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement }>();
  /** F-009: each join's control, keyed by the clip before it (kept, so focus stays on it across edits). */
  const joins = new Map<string, JoinEls>();
  let boxes: ClipBox[] = [];
  let scale = 0;
  let labels: { at: Micros; node: HTMLElement; width: number }[] = [];
  // ── F-013 view state ──
  /** The view's width, the time axis' start and end padding in `content`, and the centred mode (D-013). */
  let viewW = 0;
  let padStart = 0;
  let padEnd = 0;
  let centred = false;
  let range: ZoomRange = { min: 0, max: 0 };
  /** The span the ruler covers and the part of it made (F-013: only near the view). */
  let rulerSpan: Micros = EMPTY_SPAN;
  let rulerClear = 0;
  let rulerWin: readonly [Micros, Micros] = [0, 0];
  /** The scroll the view last set itself; any other is the user's (a manual scroll). */
  let expected = 0;
  /** RULE-14 *During playback* (pointer): the view follows the playhead until a manual scroll. */
  let following = true;
  /** Centred mode: the time under the centre line, continuous during a touch scroll (the playhead is its frame). */
  let scrollTime: Micros = 0;
  /** A zoom asked for by a control, the wheel or a pinch: the time to keep at view x `x`. */
  let anchor: { readonly t: Micros; readonly x: number } | null = null;
  const nav = signal<TimelineNav>({ canZoomIn: false, canZoomOut: false, framePx: null, centred: false });
  /** The touches down on the lanes, a one-finger scroll, a pinch, and the scroll's momentum (an animation frame). */
  const touches = new Map<number, { x: number; y: number }>();
  let pan: Pan | null = null;
  let pinch: Pinch | null = null;
  let glide = 0;
  /** The pointer scrubbing on the ruler (F-002.R3). */
  let scrubbing: number | null = null;
  let drag: Drag | null = null;
  let trim: Trim | null = null;
  /** A trim move is being applied: the project change it makes is the drag's own. */
  let applying = false;
  /** Bumped when a trim ends, so the track is laid out again at the fitting scale. */
  const relayout = signal(0);
  let suppressClick = false;

  const xOf = (t: Micros): string => `${t * scale}px`;

  /** The time axis' part near the view: the view and one view's width on each side (content pixels from 0). */
  function nearView(): readonly [number, number] {
    const left = host.scrollLeft - padStart;
    return [left - viewW, left + 2 * viewW];
  }
  /** The time axis' part in the view. */
  function inView(): readonly [number, number] {
    const left = host.scrollLeft - padStart;
    return [left, left + viewW];
  }

  /**
   * The thumbnails along a clip (F-003): its source's picture repeated. F-013: the canvas covers only the part
   * of the clip near the view, so a clip zoomed to frames (hundreds of thousands of pixels) never makes a
   * canvas wider than three views (NFR-05).
   */
  function drawStrip(c: ClipEls, clip: Clip, box: ClipBox): void {
    const [l, r] = nearView();
    const a = Math.max(0, Math.floor(l - box.x));
    const b = Math.min(Math.round(box.width), Math.ceil(r - box.x));
    const win = b > a ? ([a, b] as const) : null;
    c.win = win;
    if (!win) {
      c.drawn = '';
      c.strip.width = 0;
      c.strip.hidden = true;
      return;
    }
    c.strip.hidden = false;
    c.strip.style.left = `${win[0]}px`;
    c.strip.style.width = `${win[1] - win[0]}px`;
    const key = `${clip.sourceId}:${win[0]}:${win[1]}`;
    if (c.drawn === key) return;
    c.drawn = key;
    // Asked on every draw: MOD-Media's registry keeps the picture, frees it while its source is out of the
    // project and rebuilds it when the source comes back (ADR-0009 §7), so a kept one could be closed.
    void deps
      .picture(clip.sourceId)
      .catch(() => null)
      .then((img) => paint(c, key, win, img));
  }

  /** F-013: a scroll moved the view out of a clip's drawn part: draw the part near the view. */
  function stripsFollow(): void {
    const [l, r] = inView();
    const p = project.peek();
    p.clips.forEach((clip, i) => {
      const box = boxes[i];
      const c = clips.get(clip.id);
      if (!box || !c) return;
      const a = Math.max(0, l - box.x);
      const b = Math.min(box.width, r - box.x);
      if (b <= a) return;
      if (c.win && c.win[0] <= a && c.win[1] >= Math.floor(b)) return;
      drawStrip(c, clip, box);
    });
  }

  function paint(c: ClipEls, key: string, win: readonly [number, number], img: CanvasImageSource | null): void {
    const iw = (img as { width: number } | null)?.width ?? 0;
    const ih = (img as { height: number } | null)?.height ?? 0;
    // A closed bitmap has no size: nothing to draw (the next layout asks again).
    if (c.drawn !== key || !img || !iw || !ih) {
      if (c.drawn === key) c.drawn = '';
      return;
    }
    const ratio = devicePixelRatio || 1;
    c.strip.width = Math.round(Math.max(1, win[1] - win[0]) * ratio);
    c.strip.height = Math.round((c.film.clientHeight || 1) * ratio);
    const ctx = c.strip.getContext('2d');
    if (!ctx) return;
    const tileH = c.strip.height;
    const tileW = Math.max(1, Math.round((tileH * iw) / ih));
    // The tiles keep their places along the whole clip, wherever the drawn part starts.
    const phase = Math.round(win[0] * ratio) % tileW;
    try {
      // The picture repeats along the clip, each tile cropped to fill it (cover).
      for (let x = -phase; x < c.strip.width; x += tileW) ctx.drawImage(img, x, 0, tileW, tileH);
    } catch {
      // Closed between the size check and the draw: the next layout draws it again.
      c.drawn = '';
    }
  }

  function clipEls(id: string): ClipEls {
    let c = clips.get(id);
    if (c) return c;
    const button = el('button', 'tk-clip');
    button.type = 'button';
    button.dataset['clipId'] = id;
    // RULE-20 *Scope* (build question 205): a timeline item takes Enter only; Space plays and pauses.
    button.dataset['timelineItem'] = '';
    const label = el('span', 'tk-clip__label', button);
    decorative(label);
    const name = el('span', 'tk-clip__name', label);
    const length = el('span', 'tk-clip__length', label);
    const film = el('span', 'tk-clip__film', button);
    decorative(film);
    const strip = el('canvas', 'tk-clip__strip', film);
    c = { button, name, length, film, strip, drawn: '', win: null };
    clips.set(id, c);
    return c;
  }

  /**
   * `clearEnd`: pixels before the end of the ruler left free for the project-end label. F-013: only the part
   * near the view is made (`rulerFollow` makes it again as the view scrolls); at frame zoom the frames between
   * the seconds are numbered in muted text (CMP-Timeline "frames").
   */
  function renderRuler(span: Micros, clearEnd: number): void {
    rulerSpan = span;
    rulerClear = clearEnd;
    ruler.replaceChildren();
    labels = [];
    if (scale <= 0) return;
    const [l, r] = nearView();
    const from = Math.max(0, l / scale);
    const to = Math.max(0, r / scale);
    rulerWin = [from, to];
    const ticks = rulerTicks(span, scale, LABEL_GAP_PX, { from, to, rate: project.peek().frame.frameRate });
    for (const t of ticks.minor) el('span', 'tk-ruler__tick tk-ruler__tick--minor', ruler).style.left = xOf(t);
    for (const t of ticks.labels) {
      el('span', 'tk-ruler__tick', ruler).style.left = xOf(t);
      // The project-end label takes the end of the ruler.
      if ((span - t) * scale < clearEnd) continue;
      const node = el('span', 'tk-ruler__label', ruler);
      node.textContent = deps.time(t);
      node.style.left = xOf(t);
      labels.push({ at: t, node, width: 0 });
    }
    for (const f of ticks.frames) {
      if ((span - f.at) * scale < clearEnd) continue;
      const node = el('span', 'tk-ruler__label tk-ruler__label--frame', ruler);
      node.textContent = String(f.n);
      node.style.left = xOf(f.at);
      labels.push({ at: f.at, node, width: 0 });
    }
    // A label is drawn from its time to the right (CMP-Timeline "Behavior"): measured once per render.
    for (const l of labels) l.width = l.node.offsetWidth;
    placeHead(playhead.peek());
  }

  /** F-013: the view scrolled out of the ruler's made part: make the part near the view. */
  function rulerFollow(): void {
    if (scale <= 0) return;
    const [l, r] = inView();
    // Both ends clamped as the made part is (left of 0 is padding: centred, the view often starts there).
    if (Math.max(0, l / scale) >= rulerWin[0] && Math.min(rulerSpan, r / scale) <= rulerWin[1]) return;
    renderRuler(rulerSpan, rulerClear);
  }

  /** The scroll that ends `content`'s room (0 when it fits the view). */
  const maxScroll = (): number => Math.max(0, host.scrollWidth - host.clientWidth);

  /** Scrolls the view itself (never counted as the user's scroll). */
  function setScroll(x: number): void {
    const to = Math.min(maxScroll(), Math.max(0, x));
    if (Math.abs(host.scrollLeft - to) >= 0.5) host.scrollLeft = to;
    expected = host.scrollLeft;
    afterScroll();
  }

  /** What follows the view: the ruler's made part, the drawn thumbnails, the centred playhead. */
  function afterScroll(): void {
    rulerFollow();
    stripsFollow();
    if (centred) placeHead(playhead.peek());
  }

  /** The playhead's place in `content` (pixels from its left edge). */
  const headX = (t: Micros): number => padStart + t * scale;

  /** Centred mode: put `scrollTime` at the centre. */
  function syncCentre(): void {
    setScroll(scrollTime * scale);
  }

  // Project, selection, size, zoom or language changed: lay the track out again (never on playhead moves).
  let laidOut: Project | null = null;
  const stopLayout = effect(() => {
    const p = project.value;
    void relayout.value;
    // An empty project has no playhead to centre and nothing to scroll (its ruler fits the view).
    const { w, centred: narrow } = size.value;
    const c = narrow && p.clips.length > 0;
    const chosen = zoom.value;
    // The project changed under a drag: its clip indexes are stale, so the drag ends without a move. A
    // trim's own moves change it too; any other change (a batch of media, undo) ends the trim.
    if (drag && laidOut && p !== laidOut) endDrag(false);
    if (trim && laidOut && p !== laidOut && !applying) endTrim('abort');
    // F-013: nothing left to scroll or zoom ends a pan or pinch.
    if (!p.clips.length) endGestures();
    laidOut = p;
    track.setAttribute('aria-label', deps.trackLabel());
    const selected = new Set(selection.value);
    const projEnd = projectEnd(p);
    const span = projEnd > 0 ? projEnd : EMPTY_SPAN;
    const rate = p.frame.frameRate;

    // F-013: the view's width and padding. Centred (D-013): half a view on each side, so the project's start
    // and end both reach the centre line.
    const wasScale = scale;
    const wasCentred = centred;
    const keep = anchor ?? (wasScale > 0 && !wasCentred && !c ? defaultAnchor() : null);
    viewW = w;
    centred = c;
    host.toggleAttribute('data-centred', c);
    if (c) {
      content.style.paddingInline = `${w / 2}px`;
      padStart = padEnd = w / 2;
    } else {
      content.style.paddingInline = '';
      const style = getComputedStyle(content);
      padStart = parseFloat(style.paddingInlineStart) || 0;
      padEnd = parseFloat(style.paddingInlineEnd) || 0;
    }
    const fit = c ? centredFit(w, projEnd) : fitScale(w - padStart - padEnd, projEnd);
    range = zoomRange(fit, rate);
    // During a trim the scale holds still, so the dragged edge stays under the pointer (F-004). An empty
    // project always fits (its zoom controls are unavailable; the chosen zoom is kept, RULE-23).
    scale = trim ? trim.scale : !p.clips.length || chosen === null ? fit : clampScale(chosen, range);
    const total = padStart + span * scale + padEnd;
    content.style.inlineSize = `${Math.abs(total - w) < 0.5 ? w : Math.max(w, total)}px`;
    content.style.setProperty('--pad-start', `${padStart}px`);
    boxes = clipBoxes(p, scale);
    content.toggleAttribute('data-empty', !p.clips.length);
    hint.hidden = p.clips.length > 0;
    hint.textContent = p.clips.length ? '' : deps.emptyHint();

    // COPY-timeline.project_end after the end line, or before it when the room after it is too small
    // (a long label, as in vi-VN).
    end.hidden = p.clips.length === 0;
    end.style.left = xOf(projEnd);
    endLabel.textContent = deps.endLabel();
    const labelWidth = end.hidden ? 0 : endLabel.offsetWidth;
    const flip = !end.hidden && labelWidth > padEnd;
    end.toggleAttribute('data-flip', flip);

    // The scroll: keep the anchor's time where it was (a zoom), or the playhead at the centre (D-013).
    if (c) {
      if (!gesture()) scrollTime = Math.min(playhead.peek(), projEnd);
      syncCentre();
    } else if (keep && scale !== wasScale) {
      setScroll(anchoredScroll(keep.t, keep.x, padStart, scale));
    } else {
      expected = host.scrollLeft;
    }
    anchor = null;
    renderRuler(span, end.hidden ? 0 : flip ? labelWidth + LABEL_GAP_PX / 4 : LABEL_GAP_PX / 2);

    const keepIds = new Set(p.clips.map((c) => c.id));
    for (const [id, c] of clips) {
      if (keepIds.has(id)) continue;
      c.button.remove();
      clips.delete(id);
    }
    for (const node of track.querySelectorAll('.tk-xfade')) node.remove();
    p.clips.forEach((clip, i) => {
      const box = boxes[i]!;
      const c = clipEls(clip.id);
      const name = deps.name(clip);
      const length = deps.time(box.end - box.start);
      c.name.textContent = name;
      c.length.textContent = length;
      c.button.setAttribute('aria-label', `${name} ${length}`);
      c.button.setAttribute('aria-pressed', String(selected.has(clip.id)));
      // Under 48 px only the duration shows; the name moves to the tooltip (CMP-Timeline "Behavior").
      c.button.title = labelFits(box.width) ? '' : name;
      c.button.toggleAttribute('data-short', !labelFits(box.width));
      // Neighbouring clips alternate fills (trackClip, trackClipAlt).
      c.button.toggleAttribute('data-alt', i % 2 === 1);
      c.button.style.left = `${box.x}px`;
      c.button.style.width = `${box.width}px`;
      c.button.style.zIndex = String(i + 1);
      // DOM order is track order: focus moves through the clips in order (CMP-Timeline accessibility).
      if (track.children[i] !== c.button) track.insertBefore(c.button, track.children[i] ?? drop);
      drawStrip(c, clip, box);
      if (box.crossFadeOut > 0) {
        // The overlap's band (INV-03); the marker over it is the join's control (layoutJoins).
        const next = boxes[i + 1]!;
        const mark = el('span', 'tk-xfade', track);
        decorative(mark);
        mark.style.left = `${next.x}px`;
        mark.style.width = `${box.crossFadeOut * scale}px`;
        mark.style.zIndex = String(p.clips.length + 1);
        el('span', 'tk-xfade__band', mark);
      }
    });
    layoutJoins(p, selected);
    track.appendChild(drop);
    layoutText(p, selected, projEnd);
    layoutAudio(p, selected);
    placeHandles(p, selected);
    placeHead(playhead.peek());
    const empty = !p.clips.length;
    const step = frameLabelStep(scale, rate, LABEL_GAP_PX);
    const eps = 1e-9;
    nav.value = {
      canZoomIn: !empty && scale < range.max * (1 - eps),
      canZoomOut: !empty && scale > range.min * (1 + eps),
      framePx: !empty && step !== undefined ? Math.round(framePx(scale, rate)) : null,
      centred: c,
    };
  });

  function joinEls(id: string): JoinEls {
    let j = joins.get(id);
    if (j) return j;
    const button = el('button', 'tk-join');
    button.type = 'button';
    button.dataset['joinId'] = id;
    const reason = el('span', 'tk-join-reason');
    reason.id = `tk-join-reason-${id}`;
    j = { button, reason, state: '' };
    joins.set(id, j);
    return j;
  }

  /**
   * F-009 (CMP-Timeline "cross-fade"): at each join of two main-track clips, a join without a cross-fade has
   * the dashed add chip (COPY-action.add_crossfade; shown on hover, focus or when either clip is selected —
   * CSS), unavailable with its reason between clips too short (F-009.R7); a join with one has the bow-tie
   * marker over the overlap, which opens the length popover (expanded while open). After the clips in focus
   * order.
   */
  function layoutJoins(p: Project, selected: ReadonlySet<string>): void {
    const cf = deps.crossFade;
    const keep = new Set(cf ? p.clips.slice(0, -1).map((c) => c.id) : []);
    for (const [id, j] of joins) {
      if (keep.has(id)) continue;
      // A focused join that goes (its clip deleted or moved last): focus moves to the nearest clip.
      const focused = j.button === document.activeElement;
      j.button.remove();
      j.reason.remove();
      joins.delete(id);
      if (focused) (clips.get(id)?.button ?? [...clips.values()].at(-1)?.button ?? track).focus();
    }
    // Stacking follows the clip count (clips are 1…n, the overlap bands n + 1): the joins come next and the
    // main track's trim handles above them (fades.css).
    track.style.setProperty('--clip-count', String(p.clips.length));
    if (!cf) return;
    const open = cf.open.peek();
    let after: Element | null = null;
    p.clips.slice(0, -1).forEach((clip, i) => {
      const box = boxes[i]!;
      const next = boxes[i + 1]!;
      const info = cf.join(p, clip.id);
      const j = joinEls(clip.id);
      const state = info.on ? 'marker' : 'add';
      if (j.state !== state) {
        j.state = state;
        j.button.dataset['state'] = state;
        j.button.replaceChildren(glyph(state));
      }
      j.button.setAttribute('aria-label', info.label);
      // The marker sits in the middle of the overlap; the chip on the boundary.
      const x = info.on ? next.x + (box.crossFadeOut * scale) / 2 : next.x;
      j.button.style.left = `${x}px`;
      j.button.toggleAttribute('data-near', selected.has(clip.id) || selected.has(p.clips[i + 1]!.id));
      // Next to a clip under 48 px the control takes clicks only with a neighbour selected (or focused), so it
      // never covers a narrow clip's own clicks and drags.
      j.button.toggleAttribute('data-cramped', !labelFits(box.width) || !labelFits(next.width));
      j.button.dataset['x'] = String(x);
      if (info.on) {
        j.button.ariaHasPopup = 'dialog';
        j.button.setAttribute('aria-expanded', String(open === clip.id));
      } else {
        j.button.removeAttribute('aria-haspopup');
        j.button.removeAttribute('aria-expanded');
      }
      j.reason.textContent = info.reason ?? '';
      if (info.reason !== null) {
        j.button.setAttribute('aria-disabled', String(true));
        j.button.setAttribute('aria-describedby', j.reason.id);
        j.button.title = info.reason;
      } else {
        j.button.removeAttribute('aria-disabled');
        j.button.removeAttribute('aria-describedby');
        j.button.title = '';
      }
      // In join order after the clips. Moved only when out of place: moving a focused control would blur it.
      const prev = j.button.previousElementSibling;
      const inPlace =
        j.button.parentElement === track &&
        j.button.nextElementSibling === j.reason &&
        (after ? prev === after : !prev?.matches('.tk-join, .tk-join-reason'));
      if (!inPlace) {
        if (after) after.after(j.button, j.reason);
        else track.insertBefore(j.button, track.querySelector(':scope > .tk-join') ?? drop);
        j.button.after(j.reason);
      }
      after = j.reason;
    });
  }

  // F-009: the open popover's marker shows the expanded state (no relayout).
  const stopOpen = effect(() => {
    const open = deps.crossFade?.open.value ?? null;
    for (const [id, j] of joins) if (j.state === 'marker') j.button.setAttribute('aria-expanded', String(open === id));
  });

  // The add chip shows while the pointer is near its join (within half a chip and a little), not over the
  // whole track.
  let hovered: HTMLButtonElement | null = null;
  const setHover = (b: HTMLButtonElement | null): void => {
    if (hovered === b) return;
    hovered?.removeAttribute('data-hover');
    hovered = b;
    hovered?.setAttribute('data-hover', '');
  };
  const onJoinHover = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || drag?.active || trim) return setHover(null);
    const x = e.clientX - track.getBoundingClientRect().left;
    let best: HTMLButtonElement | null = null;
    let bestD = JOIN_HOVER_PX;
    for (const j of joins.values()) {
      const d = Math.abs(Number(j.button.dataset['x']) - x);
      if (d <= bestD) {
        best = j.button;
        bestD = d;
      }
    }
    setHover(best);
  };
  const onJoinLeave = (): void => setHover(null);

  const onJoinClick = (e: MouseEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-join');
    const id = button?.dataset['joinId'];
    const cf = deps.crossFade;
    if (!button || id === undefined || !cf) return;
    e.stopPropagation();
    if (button.dataset['state'] === 'marker') cf.toggle(id);
    else cf.add(id);
  };

  /** F-004: the trim handles on the selected main-track clip or audio clip (CMP-Timeline "trimming"). */
  function placeHandles(p: Project, selected: ReadonlySet<string>): void {
    const id = [...selected][0];
    const span = id !== undefined ? itemSpan(p, id) : null;
    const lane =
      span?.kind === 'clip' ? track : span?.kind === 'audio' ? audioLane : span?.kind === 'text' ? textLane : null;
    for (const h of handles) {
      if (!span || !lane || id === undefined) {
        h.remove();
        continue;
      }
      h.dataset['itemId'] = id;
      h.dataset['lane'] = span.kind;
      const t = h.dataset['edge'] === 'start' ? span.start : span.end;
      h.style.left = `${t * scale}px`;
      // F-010: on the text lane the handles sit on the item's row.
      h.style.setProperty(
        '--row',
        span.kind === 'text' ? (texts.get(id)?.button.style.getPropertyValue('--row') ?? '0') : '0',
      );
      if (h.parentElement !== lane) lane.appendChild(h);
    }
  }

  function textEls(id: string): { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement } {
    let t = texts.get(id);
    if (t) return t;
    const button = el('button', 'tk-tclip');
    button.type = 'button';
    button.dataset['textId'] = id;
    // RULE-20 *Scope* (build question 205): a timeline item takes Enter only; Space plays and pauses.
    button.dataset['timelineItem'] = '';
    const name = el('span', 'tk-tclip__name', button);
    decorative(name);
    const past = el('span', 'tk-aclip__past', button);
    decorative(past);
    t = { button, name, past };
    texts.set(id, t);
    return t;
  }

  /**
   * F-010: the text lane — every text layer at its times, showing its text; later layers draw on top (stacking
   * order); focus order is time order. The part past the project end is hatched (INV-07).
   */
  function layoutText(p: Project, selected: ReadonlySet<string>, projEnd: Micros): void {
    const keep = new Set(p.textLayers.map((t) => t.id));
    for (const [id, t] of texts) {
      if (keep.has(id)) continue;
      t.button.remove();
      texts.delete(id);
    }
    const order = p.textLayers
      .map((layer, i) => ({ layer, i }))
      .sort((a, b) => a.layer.start - b.layer.start || a.i - b.i);
    // Layers that overlap in time take separate rows (up to TEXT_ROWS; more share the last), so each can be
    // reached with a pointer (build question 167).
    const rowEnds: Micros[] = [];
    const rowOf = order.map(({ layer }) => {
      let r = rowEnds.findIndex((end) => end <= layer.start);
      if (r < 0) r = Math.min(rowEnds.length, TEXT_ROWS - 1);
      rowEnds[r] = Math.max(rowEnds[r] ?? 0, layer.end);
      return r;
    });
    // The lane grows with its rows; the gutter (outside the lanes) follows the same property.
    (host.parentElement ?? host).style.setProperty('--text-rows', String(Math.max(1, rowEnds.length)));
    order.forEach(({ layer, i }, n) => {
      const t = textEls(layer.id);
      const x = layer.start * scale;
      const w = Math.max(1, (layer.end - layer.start) * scale);
      const name = deps.textName?.(layer) ?? layer.content;
      const length = deps.time(layer.end - layer.start);
      t.name.textContent = name;
      t.button.setAttribute('aria-label', `${name} ${length}`);
      t.button.setAttribute('aria-pressed', String(selected.has(layer.id)));
      t.button.title = labelFits(w) ? '' : name;
      t.button.style.left = `${x}px`;
      t.button.style.width = `${w}px`;
      t.button.style.setProperty('--row', String(rowOf[n]));
      // Later layers on top (RULE-11); the selected item above the others, so it shows whole.
      t.button.style.zIndex = String(selected.has(layer.id) ? p.textLayers.length + 1 : i + 1);
      const pastEnd = p.clips.length > 0 && layer.end > projEnd ? Math.max(0, (projEnd - layer.start) * scale) : null;
      t.past.hidden = pastEnd === null;
      if (pastEnd !== null) t.past.style.left = `${pastEnd}px`;
      if (textLane.children[n] !== t.button) textLane.insertBefore(t.button, textLane.children[n] ?? null);
    });
  }

  function audioEls(id: string): { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement } {
    let a = audios.get(id);
    if (a) return a;
    const button = el('button', 'tk-aclip');
    button.type = 'button';
    button.dataset['audioId'] = id;
    // RULE-20 *Scope* (build question 205): a timeline item takes Enter only; Space plays and pauses.
    button.dataset['timelineItem'] = '';
    const wave = el('span', 'tk-aclip__wave', button);
    decorative(wave);
    const chip = el('span', 'tk-aclip__chip', button);
    decorative(chip);
    const name = el('span', 'tk-aclip__name', chip);
    const past = el('span', 'tk-aclip__past', button);
    decorative(past);
    a = { button, name, past };
    audios.set(id, a);
    return a;
  }

  /** F-011: the audio lane — every audio clip at its time; the part past the project end hatched (INV-07). */
  function layoutAudio(p: Project, selected: ReadonlySet<string>): void {
    const keep = new Set(p.audioClips.map((a) => a.id));
    for (const [id, a] of audios) {
      if (keep.has(id)) continue;
      a.button.remove();
      audios.delete(id);
    }
    const boxes = audioBoxes(p, scale);
    // Time order (focus order, CMP-Timeline accessibility); the list itself is in insertion order.
    const order = p.audioClips.map((clip, i) => ({ clip, box: boxes[i]! })).sort((a, b) => a.box.start - b.box.start);
    order.forEach(({ clip, box }, i) => {
      const a = audioEls(clip.id);
      const name = deps.audioName?.(clip) ?? '';
      const length = deps.time(box.end - box.start);
      a.name.textContent = name;
      a.button.setAttribute('aria-label', `${name} ${length}`);
      a.button.setAttribute('aria-pressed', String(selected.has(clip.id)));
      a.button.title = labelFits(box.width) ? '' : name;
      a.button.toggleAttribute('data-muted', clip.muted);
      a.button.style.left = `${box.x}px`;
      a.button.style.width = `${box.width}px`;
      a.past.hidden = box.pastEndX === null;
      if (box.pastEndX !== null) a.past.style.left = `${box.pastEndX}px`;
      // DOM order is time order (items focusable in order, CMP-Timeline accessibility).
      if (audioLane.children[i] !== a.button) audioLane.insertBefore(a.button, audioLane.children[i] ?? null);
    });
  }

  function placeHead(t: Micros): void {
    // D-013: centred, the playhead is the time under the view's centre line, where the scroll put it.
    const x = centred ? host.scrollLeft : t * scale;
    head.style.transform = `translateX(${x}px)`;
    // No playhead in an empty project: every label shows.
    const shown = project.peek().clips.length > 0;
    // D-039, CMP-Timeline "Behavior": a label anywhere under the head hides, including the text to the right of its
    // time (QA a11y m11: the head struck through "0:05" when it sat over the label's text).
    for (const l of labels) {
      const dx = x - l.at * scale;
      l.node.classList.toggle(
        'tk-ruler__label--under',
        shown && dx > -HEAD_CLEAR_PX && dx < l.width + HEAD_CLEAR_PX / 2,
      );
    }
  }

  /** The view keeps the playhead visible (a page turn at the edge) — RULE-14 *During playback*. */
  function reveal(t: Micros): boolean {
    const to = followScroll(headX(t), host.scrollLeft, viewW);
    if (to === null) return false;
    setScroll(to);
    return true;
  }

  // The playhead moves without re-laying anything out (playback ticks, scrubbing). F-013: centred, the scroll
  // follows it (unless a touch scroll or pinch is moving it); with a pointer, the view follows it while playing
  // (until a manual scroll, and again once it is back in view), and shows it when it moves out of view while
  // paused (a frame step, Home or End, an undo) — never during a scrub or drag.
  const stopHead = effect(() => {
    const t = playhead.value;
    if (centred) {
      if (!gesture() && project.peek().clips.length) {
        scrollTime = t;
        syncCentre();
      }
      placeHead(t);
      return;
    }
    placeHead(t);
    if (!project.peek().clips.length || scale <= 0) return;
    const busy = scrubbing !== null || !!drag?.active || !!trim || !!pan?.moved;
    if (playing.peek()) {
      // A scrub, drag, trim or scroll in progress owns the view (no page turn per pointer move).
      if (busy) return;
      const x = headX(t);
      const visible = x >= host.scrollLeft && x <= host.scrollLeft + viewW;
      if (following) reveal(t);
      else if (visible) following = true;
    } else if (!busy && !pan) {
      reveal(t);
    }
  });

  // RULE-14: playback (re)starting follows the playhead again, and shows it.
  const stopPlaying = effect(() => {
    if (!playing.value) return;
    following = true;
    if (!centred && project.peek().clips.length) reveal(playhead.peek());
  });

  // ── Ruler: scrub (F-002.R3) ──────────────────────────────────────────────────────────────────────
  // F-013: with a pointer the scrubbed playhead snaps to the items' edges (RULE-14), when snapping is on.
  // Centred (D-013) the ruler scrolls instead (the gestures below).
  function scrubTo(clientX: number): void {
    const p = project.peek();
    const t = timeAt(clientX - track.getBoundingClientRect().left, scale, projectEnd(p));
    const snapped = snapping.peek() ? snapTime(t, playheadSnapTargets(p), scale) : null;
    const rate = p.frame.frameRate;
    playhead.value = Math.min(projectEnd(p), frameStart(nearestFrame(snapped ?? t, rate), rate));
  }
  const onRulerDown = (e: PointerEvent): void => {
    if (!project.peek().clips.length || e.button !== 0 || centred) return;
    e.preventDefault();
    scrubbing = e.pointerId;
    capture(ruler, e.pointerId);
    // RULE-14: a touch scrub pauses playback first; with a pointer the preview follows, latest wins.
    if (e.pointerType === 'touch') deps.scrubStart?.();
    scrubTo(e.clientX);
  };
  const onRulerMove = (e: PointerEvent): void => {
    if (scrubbing !== e.pointerId) return;
    // The button was released where the ruler never heard it: the scrub is over.
    if (e.pointerType !== 'touch' && e.buttons === 0) {
      scrubbing = null;
      return;
    }
    scrubTo(e.clientX);
  };
  const onRulerUp = (e: PointerEvent): void => {
    if (scrubbing === e.pointerId) scrubbing = null;
  };
  ruler.addEventListener('pointerdown', onRulerDown);
  ruler.addEventListener('pointermove', onRulerMove);
  ruler.addEventListener('pointerup', onRulerUp);
  ruler.addEventListener('pointercancel', onRulerUp);

  // ── Ruler as a slider (F-002.R8) ─────────────────────────────────────────────────────────────────────
  // Its value is the playhead, read as the time with the project length; unavailable in an empty project.
  const stopRulerValue = effect(() => {
    const p = project.value;
    const t = playhead.value;
    const end = projectEnd(p);
    const has = p.clips.length > 0;
    ruler.tabIndex = has ? 0 : -1;
    if (has) ruler.removeAttribute('aria-disabled');
    else ruler.setAttribute('aria-disabled', String(true));
    const label = deps.rulerLabel?.();
    if (label) ruler.setAttribute('aria-label', label);
    ruler.setAttribute('aria-valuemax', String(Math.round(end / 1000) / 1000));
    ruler.setAttribute('aria-valuenow', String(Math.round(Math.min(t, end) / 1000) / 1000));
    const text = deps.rulerValue?.(Math.min(t, end), end);
    if (text) ruler.setAttribute('aria-valuetext', text);
  });
  // Arrows 1 s, Page Up / Page Down 10 s, Home / End the project's start and end; on a frame start.
  const onRulerKey = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const p = project.peek();
    if (!p.clips.length) return;
    const end = projectEnd(p);
    const t = playhead.peek();
    const by: Record<string, Micros> = {
      ArrowRight: t + RULER_STEP_US,
      ArrowUp: t + RULER_STEP_US,
      ArrowLeft: t - RULER_STEP_US,
      ArrowDown: t - RULER_STEP_US,
      PageUp: t + RULER_PAGE_US,
      PageDown: t - RULER_PAGE_US,
      Home: 0,
      End: end,
    };
    const to = by[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const rate = p.frame.frameRate;
    playhead.value = Math.max(0, Math.min(end, to === end ? end : frameStart(nearestFrame(to, rate), rate)));
  };
  ruler.addEventListener('keydown', onRulerKey);

  // ── F-013: scroll, pan, pinch and wheel ─────────────────────────────────────────────────────────────
  /** A touch scroll, pinch or its momentum is moving the view: the playhead follows it, not the reverse. */
  function gesture(): boolean {
    return (pan?.moved ?? false) || pinch !== null || glide !== 0;
  }
  const viewLeft = (): number => host.getBoundingClientRect().left;
  const frameOf = (t: Micros): Micros => {
    const p = project.peek();
    const rate = p.frame.frameRate;
    return Math.min(projectEnd(p), frameStart(nearestFrame(Math.max(0, t), rate), rate));
  };
  /** Centred: the time under the centre line is `t` (continuous); the playhead is its frame. */
  function centreOn(t: Micros): void {
    scrollTime = Math.min(projectEnd(project.peek()), Math.max(0, t));
    syncCentre();
    playhead.value = frameOf(scrollTime);
  }
  /** Centred: the scroll comes to rest on a frame start (D-013). */
  function settle(): void {
    if (!centred) return;
    scrollTime = frameOf(scrollTime);
    syncCentre();
    playhead.value = scrollTime;
  }
  function stopGlide(): void {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
  }
  function endGestures(): void {
    stopGlide();
    pan = null;
    pinch = null;
  }
  /** F-013.R1: one Zoom in / Zoom out step, around the playhead while it is in view (else the view's centre). */
  function zoomStep(dir: 1 | -1): void {
    stopGlide();
    const next = zoomedScale(scale, dir, range);
    if (centred) zoomAt(next, viewW / 2);
    else zoomAt(next, defaultAnchor().x);
  }
  /** The default zoom anchor: the playhead while it is in view, else the view's centre. */
  function defaultAnchor(): { t: Micros; x: number } {
    const x = headX(playhead.peek()) - host.scrollLeft;
    const at = x >= 0 && x <= viewW ? x : viewW / 2;
    return { t: scrollTimeAt(at, host.scrollLeft, padStart, scale), x: at };
  }
  /**
   * Zoom to `next` (clamped to RULE-14's range) keeping the time under view x `x` there (F-013.AC4). Centred,
   * that moves the time under the centre line, so the playhead follows (a pinch scrubs).
   */
  function zoomAt(next: number, x: number): void {
    const s = clampScale(next, range);
    const t = scrollTimeAt(x, host.scrollLeft, padStart, scale);
    batch(() => {
      if (centred) scrollTime = Math.min(projectEnd(project.peek()), Math.max(0, t - (x - viewW / 2) / s));
      else anchor = { t, x };
      zoom.value = s <= range.min * (1 + 1e-9) ? null : s;
    });
    anchor = null;
    if (centred) {
      syncCentre();
      if (gesture()) playhead.value = frameOf(scrollTime);
      else settle();
    }
  }

  const onScroll = (): void => {
    const now = host.scrollLeft;
    if (Math.abs(now - expected) > 1) {
      // The user scrolled (wheel, trackpad, scroll bar, keyboard, focus).
      expected = now;
      if (centred && project.peek().clips.length && scale > 0 && !gesture()) {
        // D-013: the scroll is the playhead; a scroll during playback pauses it first.
        if (playing.peek()) deps.scrubStart?.();
        scrollTime = Math.min(projectEnd(project.peek()), now / scale);
        playhead.value = frameOf(scrollTime);
      } else if (!centred && playing.peek()) {
        // RULE-14: a manual scroll stops following until playback restarts or the playhead is back in view.
        following = false;
      }
      afterScroll();
    } else if (now !== expected) {
      afterScroll();
    }
    // Else the view's own scroll, already followed by `setScroll`.
  };

  const onGestureDown = (e: PointerEvent): void => {
    // A touch that stops a glide leaves the view on a frame start (D-013).
    if (glide) {
      stopGlide();
      settle();
    }
    const touch = e.pointerType === 'touch';
    // The first finger of a new touch starts afresh (a lost touchend must not make the next touch a pinch).
    if (touch && e.isPrimary) touches.clear();
    if (touch) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onRuler = !!(e.target as Element).closest('.tk-ruler');
    if (!project.peek().clips.length || scale <= 0) return;
    // Outside the centred layout the ruler scrubs (F-002.R3), on touch too: no scroll from it.
    if ((onRuler && !centred) || scrubbing === e.pointerId) return;
    // A mouse drags the project only on the centred ruler (elsewhere it selects, drags and trims).
    if (!touch && !(centred && onRuler && e.button === 0)) return;
    if (trim?.pointerId === e.pointerId) return;
    if (touch && touches.size === 2 && !trim && !drag?.active) {
      startPinch();
      return;
    }
    if (pan || pinch || touches.size > 2) return;
    pan = {
      id: e.pointerId,
      mouse: !touch,
      onRuler,
      startX: e.clientX,
      startScroll: host.scrollLeft,
      startTime: scrollTime,
      startHead: playhead.peek(),
      moved: false,
      samples: [{ x: e.clientX, at: e.timeStamp }],
    };
    if (!touch) {
      e.preventDefault();
      capture(ruler, e.pointerId);
    }
  };

  function startPinch(): void {
    const [a, b] = [...touches.keys()];
    const pa = touches.get(a!)!;
    const pb = touches.get(b!)!;
    // A pending hold is not a move any more; a scroll in progress stops where it is.
    if (drag && !drag.active) endDrag(false);
    if (pan?.moved) settle();
    pan = null;
    const mid = (pa.x + pb.x) / 2 - viewLeft();
    pinch = {
      a: a!,
      b: b!,
      startDist: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)),
      startZoom: zoom.peek(),
      startScale: scale,
      startScroll: host.scrollLeft,
      startTime: scrollTime,
      startHead: playhead.peek(),
      anchorT: scrollTimeAt(mid, host.scrollLeft, padStart, scale),
    };
    // Centred, a pinch moves the time under the centre line: it scrubs, so playback pauses first (RULE-14).
    if (centred && playing.peek()) deps.scrubStart?.();
  }

  function movePinch(): void {
    const g = pinch;
    if (!g) return;
    const pa = touches.get(g.a);
    const pb = touches.get(g.b);
    if (!pa || !pb) return;
    const dist = Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y));
    const mid = (pa.x + pb.x) / 2 - viewLeft();
    const s = clampScale((g.startScale * dist) / g.startDist, range);
    batch(() => {
      if (centred) scrollTime = Math.min(projectEnd(project.peek()), Math.max(0, g.anchorT - (mid - viewW / 2) / s));
      else anchor = { t: g.anchorT, x: mid };
      zoom.value = s <= range.min * (1 + 1e-9) ? null : s;
    });
    anchor = null;
    if (centred) {
      syncCentre();
      playhead.value = frameOf(scrollTime);
    } else {
      // The scale may not have changed (at a range end): the fingers still pan.
      setScroll(anchoredScroll(g.anchorT, mid, padStart, scale));
    }
  }

  function endPinch(cancel: boolean): void {
    const g = pinch;
    pinch = null;
    if (!g) return;
    if (cancel) {
      // A cancelled pinch (the browser took the gesture) puts the zoom and the view back.
      zoom.value = g.startZoom;
      if (centred) {
        scrollTime = g.startTime;
        syncCentre();
        playhead.value = g.startHead;
      } else setScroll(g.startScroll);
      return;
    }
    settle();
  }

  function applyPan(g: Pan, dx: number): void {
    if (centred) {
      scrollTime = Math.min(projectEnd(project.peek()), Math.max(0, g.startTime - dx / scale));
      syncCentre();
      playhead.value = frameOf(scrollTime);
    } else setScroll(g.startScroll - dx);
  }

  const onGestureMove = (e: PointerEvent): void => {
    const t = touches.get(e.pointerId);
    if (t) {
      t.x = e.clientX;
      t.y = e.clientY;
    }
    if (pinch && (pinch.a === e.pointerId || pinch.b === e.pointerId)) {
      if (e.cancelable) e.preventDefault();
      movePinch();
      return;
    }
    const g = pan;
    if (!g || g.id !== e.pointerId) return;
    if (g.mouse && e.buttons === 0) {
      endPan(g, false);
      return;
    }
    // A held item drags, or a trim handle trims: the scroll gives way (RULE-21).
    if (drag?.active || trim) {
      pan = null;
      return;
    }
    const dx = e.clientX - g.startX;
    if (!g.moved) {
      if (Math.abs(dx) < DRAG_SLOP_PX) return;
      g.moved = true;
      // RULE-14: a touch scroll during playback pauses it first, then scrubs.
      if (centred && playing.peek()) deps.scrubStart?.();
    }
    if (e.cancelable) e.preventDefault();
    g.samples.push({ x: e.clientX, at: e.timeStamp });
    if (g.samples.length > 6) g.samples.shift();
    applyPan(g, dx);
  };

  function endPan(g: Pan, cancel: boolean, clientX?: number, releasedAt?: number): void {
    pan = null;
    if (cancel) {
      // A cancelled scroll (the browser took the pointer) puts the view and the playhead back.
      if (centred) {
        scrollTime = g.startTime;
        syncCentre();
        playhead.value = g.startHead;
      } else setScroll(g.startScroll);
      return;
    }
    if (!g.moved) {
      // D-013, F-002.R3: a tap on the centred ruler scrolls that time to the centre.
      if (centred && g.onRuler && clientX !== undefined) {
        const at = clientX - viewLeft();
        centreOn(scrollTimeAt(at, host.scrollLeft, padStart, scale));
        settle();
      }
      return;
    }
    // Momentum: the scroll glides on at the release speed, slowing down, and comes to rest on a frame start.
    const first = g.samples[0]!;
    const last = g.samples[g.samples.length - 1]!;
    const dt = last.at - first.at;
    // A finger that rested before lifting does not glide.
    const rested = releasedAt !== undefined && releasedAt - last.at > 100;
    // CMP-Timeline "Behavior": with reduced motion requested the scroll stops where the finger lifts (no glide).
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let v = !still && !rested && dt > 0 && dt < 200 ? (last.x - first.x) / dt : 0;
    if (Math.abs(v) < MOMENTUM_STOP * 4) {
      settle();
      return;
    }
    let dx = last.x - g.startX;
    let prev = performance.now();
    const step = (now: number): void => {
      const elapsed = Math.max(0, now - prev);
      prev = now;
      dx += v * elapsed;
      v *= MOMENTUM_DECAY ** (elapsed / 16);
      applyPan(g, dx);
      const atEnd = centred ? scrollTime <= 0 || scrollTime >= projectEnd(project.peek()) : false;
      if (Math.abs(v) < MOMENTUM_STOP || atEnd) {
        glide = 0;
        settle();
        return;
      }
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }

  const onGestureUp = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    const cancel = e.type === 'pointercancel';
    if (pinch && (pinch.a === e.pointerId || pinch.b === e.pointerId)) {
      // Lifting one finger ends the pinch; the other does not scroll until it is lifted too.
      endPinch(cancel);
      return;
    }
    if (pan?.id === e.pointerId) endPan(pan, cancel, e.clientX, e.timeStamp);
  };

  /** Ctrl/⌘ + wheel (and a trackpad pinch) zooms around the pointer; a vertical wheel scrolls along time. */
  const onWheel = (e: WheelEvent): void => {
    // Ctrl/⌘ + wheel over the timeline never zooms the page, even with nothing to zoom.
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    if (!project.peek().clips.length || scale <= 0) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewW : 1;
    if (e.ctrlKey || e.metaKey) {
      stopGlide();
      zoomAt(scale * Math.exp(-e.deltaY * unit * WHEEL_ZOOM), e.clientX - viewLeft());
      return;
    }
    // A vertical wheel scrolls along time while the view can move that way; at an end the page scrolls.
    const canMove = e.deltaY > 0 ? host.scrollLeft < maxScroll() - 0.5 : host.scrollLeft > 0.5;
    if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && canMove) {
      e.preventDefault();
      host.scrollLeft += e.deltaY * unit;
    }
  };
  host.addEventListener('scroll', onScroll, { passive: true });
  host.addEventListener('wheel', onWheel, { passive: false });
  // ── Track: select (R1) and drag to move (R2) ────────────────────────────────────────────────────
  function endDrag(commit: boolean): void {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    const button =
      d.kind === 'audio'
        ? audios.get(d.id)?.button
        : d.kind === 'text'
          ? texts.get(d.id)?.button
          : clips.get(d.id)?.button;
    button?.classList.remove('tk-clip--dragging');
    if (button) button.style.transform = '';
    track.classList.remove('tk-track--dragging');
    drop.hidden = true;
    snapLine.hidden = true;
    if (!d.active) return;
    // The click that ends this drag (on the clip or the track) does not select again.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    deps.select(d.id);
    if (d.kind === 'text') {
      // RULE-21 hold-and-drag: the layer moves by whole frames, keeping its length (F-010.R4).
      const rate = project.peek().frame.frameRate;
      const frames = Math.round((d.dx / scale) * (rate / 1_000_000));
      if (commit && frames !== 0) deps.moveText?.(d.id, frames);
      return;
    }
    if (d.kind === 'audio') {
      const a = project.peek().audioClips.find((x) => x.id === d.id);
      if (commit && a && d.dx !== 0)
        deps.moveAudio?.(d.id, audioDragStart(a.start, d.dx, scale, project.peek().frame.frameRate));
      return;
    }
    const to = commit && d.boundary !== null ? moveTarget(d.index, d.boundary) : null;
    if (to !== null) deps.move(d.id, to);
  }
  function startDrag(d: Drag): void {
    d.active = true;
    if (d.kind === 'text') {
      texts.get(d.id)?.button.classList.add('tk-clip--dragging');
      capture(textLane, d.pointerId);
      return;
    }
    if (d.kind === 'audio') {
      audios.get(d.id)?.button.classList.add('tk-clip--dragging');
      capture(audioLane, d.pointerId);
      return;
    }
    clips.get(d.id)?.button.classList.add('tk-clip--dragging');
    track.classList.add('tk-track--dragging');
    capture(track, d.pointerId);
  }
  // RULE-21: a tap on empty space clears the selection — the lanes outside the clips: after the project
  // end (the lanes' end padding) and below the track; the ruler scrubs instead.
  const onLanesDown = (e: PointerEvent): void => {
    const target = e.target as Element;
    if (e.button !== 0 || target.closest('.tk-clip, .tk-aclip, .tk-tclip, .tk-ruler, .tk-trim, .tk-join')) return;
    deps.select(null);
  };
  const onTrackDown = (e: PointerEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-clip');
    if (!button) return;
    if (e.button !== 0 || drag) return;
    const id = button.dataset['clipId'] ?? '';
    const index = project.peek().clips.findIndex((c) => c.id === id);
    if (index < 0) return;
    const touch = e.pointerType === 'touch';
    const d: Drag = {
      kind: 'clip',
      id,
      index,
      pointerId: e.pointerId,
      startX: e.clientX,
      touch,
      active: false,
      cancelled: false,
      timer: null,
      boundary: null,
      dx: 0,
    };
    if (touch) d.timer = setTimeout(() => !d.cancelled && drag === d && startDrag(d), HOLD_MS);
    drag = d;
  };
  const onTrackMove = (e: PointerEvent): void => {
    const d = drag;
    if (!d || d.pointerId !== e.pointerId) return;
    // The button was released where the track never heard it (a lost pointerup): no ghost drag.
    if (!d.touch && e.buttons === 0) {
      endDrag(false);
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) < DRAG_SLOP_PX) return;
      if (d.touch) {
        // Moved before the hold ended: the gesture scrolls (RULE-21).
        d.cancelled = true;
        endDrag(false);
        return;
      }
      startDrag(d);
    }
    e.preventDefault();
    d.dx = dx;
    if (d.kind === 'text' || d.kind === 'audio') {
      // F-013.R3 RULE-14: the moved item snaps by its start or end (when snapping is on), with the snap line.
      const p = project.peek();
      const span = itemSpan(p, d.id);
      const snap =
        span && snapping.peek() && scale > 0
          ? moveSnap(span.start + dx / scale, span.end + dx / scale, trimSnapTargets(p, d.id, playhead.peek()), scale)
          : null;
      if (snap) d.dx = dx + snap.delta * scale;
      snapLine.hidden = snap === null;
      if (snap) snapLine.style.transform = `translateX(${snap.at * scale}px)`;
      const item = d.kind === 'text' ? texts.get(d.id) : audios.get(d.id);
      if (item) item.button.style.transform = `translateX(${d.dx}px)`;
      return;
    }
    const c = clips.get(d.id);
    if (c) c.button.style.transform = `translateX(${dx}px)`;
    const box = boxes[d.index];
    const x = (box ? box.x + box.width / 2 : 0) + dx;
    const b = boundaryAt(boxes, x);
    d.boundary = b;
    const edge = b === boxes.length ? boxes[b - 1]!.x + boxes[b - 1]!.width : b === 0 ? 0 : boxes[b]!.x;
    drop.hidden = moveTarget(d.index, b) === null;
    drop.style.left = `${edge}px`;
  };
  // ── Trim handles (F-004.R1/R3/R4): drag an edge; RULE-14 snapping; one undo step ──────────────────
  function showReadout(t: Trim): void {
    const span = itemSpan(project.peek(), t.id);
    if (!span || !deps.trimReadout) return;
    const [length, ends] = deps.trimReadout(span.end - span.start, span.end);
    readLength.textContent = length;
    readEnd.textContent = ends;
    readout.hidden = false;
    // Below the main track for a clip, above the text or audio lane for its items; at the item, kept inside.
    const lane = t.lane === 'clip' ? track : t.lane === 'text' ? textLane : audioLane;
    const top = t.lane === 'clip' ? lane.offsetTop + lane.offsetHeight : lane.offsetTop - readout.offsetHeight;
    readout.style.top = `${top}px`;
    // At the item, kept inside the view (F-013: the lanes scroll).
    const [l, r] = inView();
    const max = Math.max(l, r - readout.offsetWidth);
    readout.style.left = `${Math.min(max, Math.max(l, span.start * t.scale))}px`;
  }
  /**
   * `commit`: the release keeps the trim. `cancel` (Esc): the edge goes back where it began, so the drag
   * leaves no step. `abort`: the project changed under the drag (undo, a batch of media): it just stops,
   * and the notices of a trim that no longer stands are not shown.
   */
  function endTrim(how: 'commit' | 'cancel' | 'abort'): void {
    const t = trim;
    trim = null;
    if (!t) return;
    if (how === 'cancel' && t.session?.active) {
      applying = true;
      try {
        t.session.to(t.from);
      } finally {
        applying = false;
      }
    }
    t.session?.end(how !== 'abort');
    snapLine.hidden = true;
    readout.hidden = true;
    host.classList.remove('tk-lanes--trimming');
    // Lay the track out again at the scale that fits the new length.
    relayout.value++;
  }
  const onTrimDown = (e: PointerEvent): void => {
    const h = (e.target as Element).closest<HTMLElement>('.tk-trim');
    if (!h || e.button !== 0 || drag || trim || !deps.trim || scale <= 0) return;
    const id = h.dataset['itemId'] ?? '';
    const p = project.peek();
    const span = itemSpan(p, id);
    if (!span) return;
    e.preventDefault();
    const edge = h.dataset['edge'] === 'start' ? 'start' : 'end';
    trim = {
      id,
      edge,
      lane: span.kind,
      pointerId: e.pointerId,
      touch: e.pointerType === 'touch',
      startX: e.clientX,
      from: edge === 'start' ? span.start : span.end,
      scale,
      base: p,
      session: null,
    };
    capture(host, e.pointerId);
  };
  const onTrimMove = (e: PointerEvent): void => {
    const t = trim;
    if (!t || t.pointerId !== e.pointerId) return;
    // The button was released where the lanes never heard it: the drag is over.
    if (!t.touch && e.buttons === 0) {
      endTrim('commit');
      return;
    }
    const dx = e.clientX - t.startX;
    if (!t.session) {
      if (dx === 0 || !deps.trim) return;
      t.session = deps.trim(t.id, t.edge, () => {
        if (trim === t) endTrim('abort');
      });
      host.classList.add('tk-lanes--trimming');
    }
    e.preventDefault();
    // Back where it began is exactly where it began: no rounding through pixels and no snapping, so the
    // drag leaves no step. A main-track clip's start may go before its own start (and before 0): the
    // trimmed head comes back (MOD-Project clamps it to the source); other edges stop at 0.
    const mainStart = t.lane === 'clip' && t.edge === 'start';
    const raw = t.from + Math.round(dx / t.scale);
    const wanted = dx === 0 ? t.from : mainStart ? raw : pointerTime(t.from * t.scale + dx, t.scale);
    // F-013.R3: only while snapping is on (F-013.AC3).
    const snapped =
      dx === 0 || !snapping.peek() ? null : snapTime(wanted, trimSnapTargets(t.base, t.id, playhead.peek()), t.scale);
    applying = true;
    try {
      t.session.to(snapped ?? wanted);
    } finally {
      applying = false;
    }
    if (trim !== t) return;
    snapLine.hidden = snapped === null;
    if (snapped !== null) snapLine.style.transform = `translateX(${snapped * t.scale}px)`;
    showReadout(t);
  };
  host.addEventListener('pointerdown', onTrimDown);
  host.addEventListener('pointermove', onTrimMove);
  // F-013: after the trim handles, so a touch on a handle trims instead of scrolling.
  host.addEventListener('pointerdown', onGestureDown);
  window.addEventListener('pointermove', onGestureMove);
  window.addEventListener('pointerup', onGestureUp);
  window.addEventListener('pointercancel', onGestureUp);

  // Also on the window: a release outside the track (or outside the page) ends the drag there.
  const onUp = (e: PointerEvent): void => {
    if (drag?.pointerId === e.pointerId) endDrag(e.type === 'pointerup');
    // A cancelled pointer (the browser took the gesture) gives the edge back, as a cancelled move does.
    if (trim?.pointerId === e.pointerId) endTrim(e.type === 'pointerup' ? 'commit' : 'cancel');
  };
  // RULE-21: once a held touch drags, the browser must not pan (it would cancel the pointer); a trim
  // handle's drag never pans.
  const onTouchMove = (e: TouchEvent): void => {
    if (((drag?.active && drag.touch) || trim) && e.cancelable) e.preventDefault();
  };
  const onClick = (e: MouseEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-clip, .tk-aclip, .tk-tclip');
    if (!button) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    // F-010 (CMP-TextEditor "Behavior"): activating the selected text item again opens the editor on it.
    const textId = button.dataset['textId'];
    if (textId !== undefined) {
      if (button.getAttribute('aria-pressed') === String(true) && deps.editText) deps.editText(textId);
      else deps.select(textId);
      return;
    }
    // Activating the selected clip again clears the selection (a toggle, as a tap on empty space).
    const id = button.dataset['clipId'] ?? button.dataset['audioId'] ?? null;
    deps.select(button.getAttribute('aria-pressed') === String(true) ? null : id);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && drag?.active) {
      e.preventDefault();
      endDrag(false);
    }
    if (e.key === 'Escape' && trim) {
      e.preventDefault();
      endTrim('cancel');
    }
  };
  // A held touch shows no context menu or text selection while it waits to drag.
  const onContext = (e: Event): void => {
    if (drag?.touch) e.preventDefault();
  };
  // F-011.R2: an audio clip drags in time (on touch after the hold), placed by the RULE-12 move rule.
  const onAudioDown = (e: PointerEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-aclip');
    if (!button || e.button !== 0 || drag) return;
    const id = button.dataset['audioId'] ?? '';
    if (!project.peek().audioClips.some((a) => a.id === id)) return;
    const touch = e.pointerType === 'touch';
    const d: Drag = {
      kind: 'audio',
      id,
      index: -1,
      pointerId: e.pointerId,
      startX: e.clientX,
      touch,
      active: false,
      cancelled: false,
      timer: null,
      boundary: null,
      dx: 0,
    };
    if (touch) d.timer = setTimeout(() => !d.cancelled && drag === d && startDrag(d), HOLD_MS);
    drag = d;
  };
  // F-010: a text item drags in time (on touch after the hold), by whole frames.
  const onTextDown = (e: PointerEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-tclip');
    if (!button || e.button !== 0 || drag) return;
    const id = button.dataset['textId'] ?? '';
    if (!project.peek().textLayers.some((t) => t.id === id)) return;
    const touch = e.pointerType === 'touch';
    const d: Drag = {
      kind: 'text',
      id,
      index: -1,
      pointerId: e.pointerId,
      startX: e.clientX,
      touch,
      active: false,
      cancelled: false,
      timer: null,
      boundary: null,
      dx: 0,
    };
    if (touch) d.timer = setTimeout(() => !d.cancelled && drag === d && startDrag(d), HOLD_MS);
    drag = d;
  };
  const onTextDouble = (e: MouseEvent): void => {
    const id = (e.target as Element).closest<HTMLElement>('.tk-tclip')?.dataset['textId'];
    if (id !== undefined && deps.editText) deps.editText(id);
  };
  textLane.addEventListener('pointerdown', onTextDown);
  textLane.addEventListener('pointermove', onTrackMove);
  textLane.addEventListener('touchmove', onTouchMove, { passive: false });
  textLane.addEventListener('click', onClick);
  textLane.addEventListener('dblclick', onTextDouble);
  textLane.addEventListener('contextmenu', onContext);
  host.addEventListener('pointerdown', onLanesDown);
  audioLane.addEventListener('pointerdown', onAudioDown);
  audioLane.addEventListener('pointermove', onTrackMove);
  audioLane.addEventListener('touchmove', onTouchMove, { passive: false });
  host.addEventListener('touchmove', onTouchMove, { passive: false });
  audioLane.addEventListener('click', onClick);
  audioLane.addEventListener('contextmenu', onContext);
  track.addEventListener('pointerdown', onTrackDown);
  track.addEventListener('pointermove', onTrackMove);
  track.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  track.addEventListener('click', onClick);
  track.addEventListener('click', onJoinClick);
  track.addEventListener('pointermove', onJoinHover);
  track.addEventListener('pointerleave', onJoinLeave);
  track.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKey, true);
  // Implements: RULE-20 *Scope* (build question 205) — Space on a focused timeline item is not the button's own
  // key: the playback keys take it on keydown, and a native button's Space activation (on keyup) is stopped here
  // so the item is not selected. Enter still selects it.
  const onItemKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    if ((e.target as Element | null)?.closest?.('[data-timeline-item]')) e.preventDefault();
  };
  host.addEventListener('keyup', onItemKeyUp);
  drop.hidden = true;

  return {
    focusClip(index: number): void {
      const n = project.peek().clips.length;
      const clip = n ? project.peek().clips[Math.min(Math.max(0, index), n - 1)] : undefined;
      const c = clip ? clips.get(clip.id) : undefined;
      (c?.button ?? track).focus();
    },
    zoomIn(): void {
      if (nav.peek().canZoomIn) zoomStep(1);
    },
    zoomOut(): void {
      if (nav.peek().canZoomOut) zoomStep(-1);
    },
    fit(): void {
      if (!project.peek().clips.length) return;
      stopGlide();
      zoom.value = null;
      if (!centred) setScroll(0);
      following = true;
    },
    scrollToPlayhead(): void {
      if (!project.peek().clips.length || centred) return;
      following = true;
      setScroll(anchoredScroll(playhead.peek(), viewW / 2, padStart, scale));
    },
    nav,
    dispose(): void {
      endGestures();
      stopLayout();
      stopHead();
      stopPlaying();
      stopRulerValue();
      ruler.removeEventListener('keydown', onRulerKey);
      stopOpen();
      resize.disconnect();
      if (drag?.timer) clearTimeout(drag.timer);
      if (trim) endTrim('abort');
      document.removeEventListener('keydown', onKey, true);
      host.removeEventListener('keyup', onItemKeyUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerdown', onLanesDown);
      host.removeEventListener('pointerdown', onTrimDown);
      host.removeEventListener('pointermove', onTrimMove);
      host.removeEventListener('touchmove', onTouchMove);
      host.removeEventListener('pointerdown', onGestureDown);
      host.removeEventListener('scroll', onScroll);
      host.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onGestureMove);
      window.removeEventListener('pointerup', onGestureUp);
      window.removeEventListener('pointercancel', onGestureUp);
      host.replaceChildren();
      host.classList.remove('tk-scroller');
      host.removeAttribute('data-centred');
    },
  };
}
