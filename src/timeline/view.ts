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
import { effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { frameStart, nearestFrame, projectEnd, type AudioClip, type Clip, type Micros, type Project } from '../core';
import {
  EMPTY_SPAN,
  audioBoxes,
  audioDragStart,
  boundaryAt,
  clipBoxes,
  fitScale,
  itemSpan,
  labelFits,
  moveTarget,
  pointerTime,
  rulerTicks,
  snapTime,
  timeAt,
  trimSnapTargets,
  type ClipBox,
} from './geometry';

export interface TimelineSignals {
  readonly project: ReadonlySignal<Project>;
  readonly selection: ReadonlySignal<readonly string[]>;
  /** The session's one playhead (MOD-Project); the preview follows it (F-002 binding). */
  readonly playhead: Signal<Micros>;
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
  /** The picture drawn along a clip: a video's first frame, a photo; null when there is none. */
  picture(sourceId: string): Promise<CanvasImageSource | null>;
  select(id: string | null): void;
  /** Move clip `id` to index `to` of the resulting order (one undo step). */
  move(id: string, to: number): void;
  /** An audio clip's title: its source's name, or the bundled track's title (F-011). */
  audioName?(clip: AudioClip): string;
  /** Move audio clip `id` to start at `start`; MOD-Project's RULE-12 move rule places it (F-011.R2). */
  moveAudio?(id: string, start: Micros): void;
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
  dispose(): void;
}

/** RULE-21: press and hold for 0.4 s, then drag, moves a clip on touch. */
export const HOLD_MS = 400;
/** A pointer that moves this far before the hold ends scrolls instead (touch), or starts a drag (mouse). */
const DRAG_SLOP_PX = 6;
/** Ruler labels at least this far apart. */
const LABEL_GAP_PX = 56;
/** Ruler labels this close to the playhead hide under its head (D-039). */
const HEAD_CLEAR_PX = 14;

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
  readonly strip: HTMLCanvasElement;
  drawn: string;
}

/** F-004: a trim handle being dragged. */
interface Trim {
  readonly id: string;
  readonly edge: 'start' | 'end';
  readonly lane: 'clip' | 'audio';
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
  /** A main-track clip, or an audio clip (F-011). */
  readonly kind: 'clip' | 'audio';
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

/**
 * Mounts CMP-Timeline's lanes into `host` (the region, its toolbar and the lane gutter are MOD-App's
 * chrome). Returns the view's commands and its unmount.
 */
export function mountTimeline(host: HTMLElement, signals: TimelineSignals, deps: TimelineDeps): TimelineView {
  const { project, selection, playhead } = signals;
  host.classList.add('tk-lanes');
  const ruler = el('div', 'tk-ruler', host);
  decorative(ruler);
  const track = el('div', 'tk-track', host);
  track.tabIndex = -1;
  // A group of the clips, named, so focus that lands here after the last clip was deleted is announced.
  track.setAttribute('role', 'group');
  const hint = el('span', 'tk-track__hint', track);
  const drop = el('span', 'tk-track__drop', track);
  decorative(drop);
  // F-011: the audio lane under the main track (the text lane comes between them with F-010).
  const audioLane = el('div', 'tk-audio-lane', host);
  const end = el('span', 'tk-end', host);
  decorative(end);
  const endLabel = el('span', 'tk-end__label', end);
  const head = el('span', 'tk-playhead', host);
  decorative(head);
  el('span', 'tk-playhead__head', head);
  // F-004: the selected item's trim handles (moved into its lane), the snap line and the trim readout.
  const handles = (['start', 'end'] as const).map((edge) => {
    const h = el('span', `tk-trim tk-trim--${edge}`);
    h.dataset['edge'] = edge;
    decorative(h);
    return h;
  });
  const snapLine = el('span', 'tk-snap', host);
  decorative(snapLine);
  snapLine.hidden = true;
  const readout = el('div', 'tk-trim-readout', host);
  decorative(readout);
  const readLength = el('span', 'tk-trim-readout__length', readout);
  el('span', 'tk-trim-readout__sep', readout).textContent = '·';
  const readEnd = el('span', 'tk-trim-readout__end', readout);
  readout.hidden = true;

  const width = signal(0);
  const resize = new ResizeObserver(() => {
    const style = getComputedStyle(host);
    width.value = host.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
  });
  resize.observe(host);

  const clips = new Map<string, ClipEls>();
  const audios = new Map<string, { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement }>();
  /** F-009: each join's control, keyed by the clip before it (kept, so focus stays on it across edits). */
  const joins = new Map<string, JoinEls>();
  let boxes: ClipBox[] = [];
  let scale = 0;
  let labels: { at: Micros; node: HTMLElement }[] = [];
  let drag: Drag | null = null;
  let trim: Trim | null = null;
  /** A trim move is being applied: the project change it makes is the drag's own. */
  let applying = false;
  /** Bumped when a trim ends, so the track is laid out again at the fitting scale. */
  const relayout = signal(0);
  let suppressClick = false;

  const xOf = (t: Micros): string => `${t * scale}px`;

  function drawStrip(c: ClipEls, clip: Clip, w: number): void {
    const key = `${clip.sourceId}:${Math.round(w)}`;
    if (c.drawn === key) return;
    c.drawn = key;
    // Asked on every draw: MOD-Media's registry keeps the picture, frees it while its source is out of the
    // project and rebuilds it when the source comes back (ADR-0009 §7), so a kept one could be closed.
    void deps
      .picture(clip.sourceId)
      .catch(() => null)
      .then((img) => paint(c, key, w, img));
  }

  function paint(c: ClipEls, key: string, w: number, img: CanvasImageSource | null): void {
    const iw = (img as { width: number } | null)?.width ?? 0;
    const ih = (img as { height: number } | null)?.height ?? 0;
    // A closed bitmap has no size: nothing to draw (the next layout asks again).
    if (c.drawn !== key || !img || !iw || !ih) {
      if (c.drawn === key) c.drawn = '';
      return;
    }
    const ratio = devicePixelRatio || 1;
    c.strip.width = Math.round(Math.max(1, Math.round(w)) * ratio);
    c.strip.height = Math.round((c.strip.clientHeight || 1) * ratio);
    const ctx = c.strip.getContext('2d');
    if (!ctx) return;
    const tileH = c.strip.height;
    const tileW = Math.max(1, Math.round((tileH * iw) / ih));
    try {
      // The picture repeats along the clip, each tile cropped to fill it (cover).
      for (let x = 0; x < c.strip.width; x += tileW) ctx.drawImage(img, x, 0, tileW, tileH);
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
    const label = el('span', 'tk-clip__label', button);
    decorative(label);
    const name = el('span', 'tk-clip__name', label);
    const length = el('span', 'tk-clip__length', label);
    const strip = el('canvas', 'tk-clip__strip', button);
    decorative(strip);
    c = { button, name, length, strip, drawn: '' };
    clips.set(id, c);
    return c;
  }

  /** `clearEnd`: pixels before the end of the ruler left free for the project-end label. */
  function renderRuler(span: Micros, clearEnd: number): void {
    ruler.replaceChildren();
    labels = [];
    const ticks = rulerTicks(span, scale, LABEL_GAP_PX);
    for (const t of ticks.minor) el('span', 'tk-ruler__tick tk-ruler__tick--minor', ruler).style.left = xOf(t);
    for (const t of ticks.labels) {
      el('span', 'tk-ruler__tick', ruler).style.left = xOf(t);
      // The project-end label takes the end of the ruler.
      if ((span - t) * scale < clearEnd) continue;
      const node = el('span', 'tk-ruler__label', ruler);
      node.textContent = deps.time(t);
      node.style.left = xOf(t);
      labels.push({ at: t, node });
    }
  }

  // Project, selection, size or language changed: lay the track out again (never on playhead moves).
  let laidOut: Project | null = null;
  const stopLayout = effect(() => {
    const p = project.value;
    void relayout.value;
    // The project changed under a drag: its clip indexes are stale, so the drag ends without a move. A
    // trim's own moves change it too; any other change (a batch of media, undo) ends the trim.
    if (drag && laidOut && p !== laidOut) endDrag(false);
    if (trim && laidOut && p !== laidOut && !applying) endTrim('abort');
    laidOut = p;
    track.setAttribute('aria-label', deps.trackLabel());
    const selected = new Set(selection.value);
    const w = width.value;
    const projEnd = projectEnd(p);
    // During a trim the scale holds still, so the dragged edge stays under the pointer (F-004).
    scale = trim ? trim.scale : fitScale(w, projEnd);
    boxes = clipBoxes(p, scale);
    host.toggleAttribute('data-empty', !p.clips.length);
    hint.hidden = p.clips.length > 0;
    hint.textContent = p.clips.length ? '' : deps.emptyHint();

    // COPY-timeline.project_end after the end line, or before it when the room after it is too small
    // (a long label, as in vi-VN).
    end.hidden = p.clips.length === 0;
    end.style.left = xOf(projEnd);
    endLabel.textContent = deps.endLabel();
    const labelWidth = end.hidden ? 0 : endLabel.offsetWidth;
    const flip =
      !end.hidden &&
      projEnd * scale + labelWidth > host.clientWidth - parseFloat(getComputedStyle(host).paddingInlineStart);
    end.toggleAttribute('data-flip', flip);
    renderRuler(
      projEnd > 0 ? projEnd : EMPTY_SPAN,
      end.hidden ? 0 : flip ? labelWidth + LABEL_GAP_PX / 4 : LABEL_GAP_PX / 2,
    );

    const keep = new Set(p.clips.map((c) => c.id));
    for (const [id, c] of clips) {
      if (keep.has(id)) continue;
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
      drawStrip(c, clip, box.width);
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
    layoutAudio(p, selected);
    placeHandles(p, selected);
    placeHead(playhead.peek());
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
      j.button.remove();
      j.reason.remove();
      joins.delete(id);
    }
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
      if (info.on) {
        j.button.setAttribute('aria-haspopup', 'dialog');
        j.button.setAttribute('aria-expanded', String(open === clip.id));
      } else {
        j.button.removeAttribute('aria-haspopup');
        j.button.removeAttribute('aria-expanded');
      }
      j.reason.textContent = info.reason ?? '';
      if (info.reason !== null) {
        j.button.setAttribute('aria-disabled', 'true');
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
    for (const [id, j] of joins)
      if (j.state === 'marker') j.button.setAttribute('aria-expanded', String(open === id));
  });

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
    const lane = span?.kind === 'clip' ? track : span?.kind === 'audio' ? audioLane : null;
    for (const h of handles) {
      if (!span || !lane || id === undefined) {
        h.remove();
        continue;
      }
      h.dataset['itemId'] = id;
      h.dataset['lane'] = span.kind;
      const t = h.dataset['edge'] === 'start' ? span.start : span.end;
      h.style.left = `${t * scale}px`;
      if (h.parentElement !== lane) lane.appendChild(h);
    }
  }

  function audioEls(id: string): { button: HTMLButtonElement; name: HTMLSpanElement; past: HTMLSpanElement } {
    let a = audios.get(id);
    if (a) return a;
    const button = el('button', 'tk-aclip');
    button.type = 'button';
    button.dataset['audioId'] = id;
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
    const x = t * scale;
    head.style.transform = `translateX(${x}px)`;
    // No playhead in an empty project: every label shows.
    const shown = project.peek().clips.length > 0;
    for (const l of labels)
      l.node.classList.toggle('tk-ruler__label--under', shown && Math.abs(l.at * scale - x) < HEAD_CLEAR_PX);
  }
  // The playhead moves without re-laying anything out (playback ticks, scrubbing).
  const stopHead = effect(() => placeHead(playhead.value));

  // ── Ruler: scrub (F-002.R3) ──────────────────────────────────────────────────────────────────────
  const trackLeft = (): number =>
    host.getBoundingClientRect().left + parseFloat(getComputedStyle(host).paddingInlineStart);
  function scrubTo(clientX: number): void {
    const p = project.peek();
    const t = timeAt(clientX - trackLeft(), scale, projectEnd(p));
    const rate = p.frame.frameRate;
    playhead.value = Math.min(projectEnd(p), frameStart(nearestFrame(t, rate), rate));
  }
  let scrubbing: number | null = null;
  const onRulerDown = (e: PointerEvent): void => {
    if (!project.peek().clips.length || e.button !== 0) return;
    e.preventDefault();
    scrubbing = e.pointerId;
    capture(ruler, e.pointerId);
    // RULE-14: a touch scrub pauses playback first; with a pointer the preview follows, latest wins.
    if (e.pointerType === 'touch') deps.scrubStart?.();
    scrubTo(e.clientX);
  };
  const onRulerMove = (e: PointerEvent): void => {
    if (scrubbing === e.pointerId) scrubTo(e.clientX);
  };
  const onRulerUp = (e: PointerEvent): void => {
    if (scrubbing === e.pointerId) scrubbing = null;
  };
  ruler.addEventListener('pointerdown', onRulerDown);
  ruler.addEventListener('pointermove', onRulerMove);
  ruler.addEventListener('pointerup', onRulerUp);
  ruler.addEventListener('pointercancel', onRulerUp);

  // ── Track: select (R1) and drag to move (R2) ────────────────────────────────────────────────────
  function endDrag(commit: boolean): void {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    const button = d.kind === 'audio' ? audios.get(d.id)?.button : clips.get(d.id)?.button;
    button?.classList.remove('tk-clip--dragging');
    if (button) button.style.transform = '';
    track.classList.remove('tk-track--dragging');
    drop.hidden = true;
    if (!d.active) return;
    // The click that ends this drag (on the clip or the track) does not select again.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    deps.select(d.id);
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
    if (e.button !== 0 || target.closest('.tk-clip, .tk-aclip, .tk-ruler, .tk-trim, .tk-join')) return;
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
    if (d.kind === 'audio') {
      const a = audios.get(d.id);
      if (a) a.button.style.transform = `translateX(${dx}px)`;
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
    // Below the main track for a clip, above the audio lane for an audio clip; at the item, kept inside.
    const lane = t.lane === 'clip' ? track : audioLane;
    const top = t.lane === 'clip' ? lane.offsetTop + lane.offsetHeight : lane.offsetTop - readout.offsetHeight;
    readout.style.top = `${top}px`;
    const max = Math.max(0, host.clientWidth - readout.offsetWidth);
    readout.style.left = `${Math.min(max, Math.max(0, span.start * t.scale))}px`;
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
    if (!span || span.kind === 'text') return;
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
    const snapped = dx === 0 ? null : snapTime(wanted, trimSnapTargets(t.base, t.id, playhead.peek()), t.scale);
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
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-clip, .tk-aclip');
    if (!button) return;
    if (suppressClick) {
      suppressClick = false;
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
  track.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKey, true);
  drop.hidden = true;

  return {
    focusClip(index: number): void {
      const n = project.peek().clips.length;
      const clip = n ? project.peek().clips[Math.min(Math.max(0, index), n - 1)] : undefined;
      const c = clip ? clips.get(clip.id) : undefined;
      (c?.button ?? track).focus();
    },
    dispose(): void {
      stopLayout();
      stopHead();
      stopOpen();
      resize.disconnect();
      if (drag?.timer) clearTimeout(drag.timer);
      if (trim) endTrim('abort');
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerdown', onLanesDown);
      host.removeEventListener('pointerdown', onTrimDown);
      host.removeEventListener('pointermove', onTrimMove);
      host.removeEventListener('touchmove', onTouchMove);
      host.replaceChildren();
      host.classList.remove('tk-lanes');
    },
  };
}
