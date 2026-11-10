// MOD-Timeline — the imperative view of CMP-Timeline (ADR-0002 §1: pointer moves, scrubbing and playback
// ticks never re-render Preact). Built here (F-003): the ruler with m:ss labels that can be scrubbed (the
// F-002 playhead binding), the playhead, the project-end marker, and the main track's clips with their
// thumbnails, names, lengths and cross-fade markers; selecting a clip; moving a clip by dragging it to the
// nearest clip boundary (RULE-05; on touch after holding it for 0.4 s, RULE-21). Zoom, scroll and the
// centre-fixed touch playhead (F-013, F-017), trim handles (F-004), the cross-fade popover (F-009) and the
// text and audio lanes (F-010, F-011) come with their features.
// Implements: F-003.R1, F-003.R2 (drag), F-002.R3 (scrub on the ruler), CMP-Timeline anatomy and
// accessibility (items focusable in order, named by their name and duration), RULE-21 hold-and-drag.
import { effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { frameStart, nearestFrame, projectEnd, type Clip, type Micros, type Project } from '../core';
import {
  EMPTY_SPAN,
  boundaryAt,
  clipBoxes,
  fitScale,
  labelFits,
  moveTarget,
  rulerTicks,
  timeAt,
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
  /** A scrub on the ruler starts (playback keeps the latest time, F-002.R3). */
  scrubStart?(): void;
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

/** The cross-fade marker's bow-tie glyph (style.md "Cross-fade marker": never an ×). */
function bowTie(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  decorative(svg);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M4 6v12l8-6zM20 6v12l-8-6z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
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

interface Drag {
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
  const end = el('span', 'tk-end', host);
  decorative(end);
  const endLabel = el('span', 'tk-end__label', end);
  const head = el('span', 'tk-playhead', host);
  decorative(head);
  el('span', 'tk-playhead__head', head);

  const width = signal(0);
  const resize = new ResizeObserver(() => {
    const style = getComputedStyle(host);
    width.value = host.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
  });
  resize.observe(host);

  const clips = new Map<string, ClipEls>();
  let boxes: ClipBox[] = [];
  let scale = 0;
  let labels: { at: Micros; node: HTMLElement }[] = [];
  let drag: Drag | null = null;
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
    // The project changed under a drag: its clip indexes are stale, so the drag ends without a move.
    if (drag && laidOut && p !== laidOut) endDrag(false);
    laidOut = p;
    track.setAttribute('aria-label', deps.trackLabel());
    const selected = new Set(selection.value);
    const w = width.value;
    const projEnd = projectEnd(p);
    scale = fitScale(w, projEnd);
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
        const next = boxes[i + 1]!;
        const mark = el('span', 'tk-xfade', track);
        decorative(mark);
        mark.style.left = `${next.x}px`;
        mark.style.width = `${box.crossFadeOut * scale}px`;
        mark.style.zIndex = String(p.clips.length + 1);
        el('span', 'tk-xfade__band', mark);
        el('span', 'tk-xfade__marker', mark).appendChild(bowTie());
      }
    });
    track.appendChild(drop);
    placeHead(playhead.peek());
  });

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
    const c = clips.get(d.id);
    c?.button.classList.remove('tk-clip--dragging');
    if (c) c.button.style.transform = '';
    track.classList.remove('tk-track--dragging');
    drop.hidden = true;
    if (!d.active) return;
    // The click that ends this drag (on the clip or the track) does not select again.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    deps.select(d.id);
    const to = commit && d.boundary !== null ? moveTarget(d.index, d.boundary) : null;
    if (to !== null) deps.move(d.id, to);
  }
  function startDrag(d: Drag): void {
    d.active = true;
    clips.get(d.id)?.button.classList.add('tk-clip--dragging');
    track.classList.add('tk-track--dragging');
    capture(track, d.pointerId);
  }
  // RULE-21: a tap on empty space clears the selection — the lanes outside the clips: after the project
  // end (the lanes' end padding) and below the track; the ruler scrubs instead.
  const onLanesDown = (e: PointerEvent): void => {
    const target = e.target as Element;
    if (e.button !== 0 || target.closest('.tk-clip, .tk-ruler')) return;
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
      id,
      index,
      pointerId: e.pointerId,
      startX: e.clientX,
      touch,
      active: false,
      cancelled: false,
      timer: null,
      boundary: null,
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
  // Also on the window: a release outside the track (or outside the page) ends the drag there.
  const onUp = (e: PointerEvent): void => {
    if (drag?.pointerId === e.pointerId) endDrag(e.type === 'pointerup');
  };
  // RULE-21: once a held touch drags, the browser must not pan (it would cancel the pointer).
  const onTouchMove = (e: TouchEvent): void => {
    if (drag?.active && drag.touch && e.cancelable) e.preventDefault();
  };
  const onClick = (e: MouseEvent): void => {
    const button = (e.target as Element).closest<HTMLButtonElement>('.tk-clip');
    if (!button) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    // Activating the selected clip again clears the selection (a toggle, as a tap on empty space).
    const id = button.dataset['clipId'] ?? null;
    deps.select(button.getAttribute('aria-pressed') === String(true) ? null : id);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && drag?.active) {
      e.preventDefault();
      endDrag(false);
    }
  };
  // A held touch shows no context menu or text selection while it waits to drag.
  const onContext = (e: Event): void => {
    if (drag?.touch) e.preventDefault();
  };
  host.addEventListener('pointerdown', onLanesDown);
  track.addEventListener('pointerdown', onTrackDown);
  track.addEventListener('pointermove', onTrackMove);
  track.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  track.addEventListener('click', onClick);
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
      resize.disconnect();
      if (drag?.timer) clearTimeout(drag.timer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerdown', onLanesDown);
      host.replaceChildren();
      host.classList.remove('tk-lanes');
    },
  };
}
