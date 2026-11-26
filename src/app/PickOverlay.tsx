// MOD-App — CMP-Preview "picking a colour" (RULE-25 pick mode, F-028): over the preview canvas while pick mode is on,
// a layer that takes every pointer, so drags and pinches never move or scale the clip (the placement and text
// overlays are under it and hidden); a crosshair over the clip's picture and the normal pointer elsewhere; the quiet
// pill COPY-replace.picking (or COPY-replace.picking_keys) and COPY-replace.original with Cancel (COPY-replace.pick_cancel) in the top-left
// corner. A mouse picks on release; on touch, pressing shows a round magnifier (an enlarged view of the picture
// around the finger with a centre ring in the colour a lift would pick; above the finger, or below it near the
// preview's top edge) and lifting picks. Started by keyboard, a marker (COPY-replace.marker, value
// COPY-replace.marker_value) starts at the centre of the clip's visible picture and takes focus: the arrow keys move
// it by 1 % of the frame (Shift: 10 %), kept within that part; Enter or Space picks; Esc cancels (RULE-20). Esc
// anywhere ends pick mode.
// Implements: F-028.R2/R8, F-028.AC3/AC4/AC16, RULE-25 *Pick mode*, *Picking*, RULE-20 (the eyedropper marker gets
// the arrow keys, Enter, Space and Esc), RULE-21 (touch targets; the gesture has the keyboard and click
// equivalents), CMP-Preview "picking a colour".
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import { screenRect } from '../preview';
import { Icon } from './icons';
import { useCanvasBox, type Box } from './PlacementOverlay';
import { endPick, pickAt, pickMode } from './pick';
import { placementTarget } from './placement';
import { playback } from './playback';

/** The magnifier's view: a block this many picture pixels square, drawn enlarged. */
const VIEW = 33;
/** RULE-25 / ADR-0017 §7: the magnifier is refreshed at most every 50 ms. */
const MAGNIFIER_MS = 50;
/** Magnifier diameter and its gap above the finger (CSS pixels). */
const LENS = 96;
const LENS_GAP = 24;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The part of the clip's picture inside the frame, in the canvas box's CSS pixels (null: none). */
function visiblePart(box: Box): Rect | null {
  const target = placementTarget.peek();
  if (!target?.picture) return { x0: 0, y0: 0, x1: box.width, y1: box.height };
  const r = screenRect({ width: box.width, height: box.height }, target.picture, target.placement);
  const x0 = Math.max(0, r.cx - r.width / 2);
  const y0 = Math.max(0, r.cy - r.height / 2);
  const x1 = Math.min(box.width, r.cx + r.width / 2);
  const y1 = Math.min(box.height, r.cy + r.height / 2);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

const pct = (v: number): number => Math.round(v * 100);

export function PickOverlay({ stage }: { readonly stage: RefObject<HTMLElement> }) {
  const mode = pickMode.value;
  const box = useCanvasBox(stage);
  const layer = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const lensCanvas = useRef<HTMLCanvasElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; hex: string | null; below: boolean } | null>(null);
  /** The keyboard marker in frame fractions, and the colour under it. */
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  const [markHex, setMarkHex] = useState<string | null>(null);
  const part = box ? visiblePart(box) : null;
  // Under 400 px the pill sits just below the playback row (CMP-Preview): its top follows that row's bottom.
  const [barTop, setBarTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!mode) return undefined;
    const narrow = window.matchMedia('(width < 400px)');
    const place = (): void => {
      const row = document.querySelector('.tk-transport');
      setBarTop(narrow.matches && row ? row.getBoundingClientRect().bottom + 4 : null);
    };
    place();
    window.addEventListener('resize', place);
    narrow.addEventListener('change', place);
    return () => {
      window.removeEventListener('resize', place);
      narrow.removeEventListener('change', place);
    };
  }, [mode]);
  // Follow the clip's placement (the crosshair area and the marker's bounds).
  void placementTarget.value;

  // The marker starts at the centre of the clip's visible picture and takes focus.
  const keys = mode?.keys ?? false;
  useEffect(() => {
    if (!keys || !box) return;
    const p = visiblePart(box);
    if (!p) return;
    setMark({ x: (p.x0 + p.x1) / 2 / box.width, y: (p.y0 + p.y1) / 2 / box.height });
    queueMicrotask(() => marker.current?.focus());
  }, [keys, mode, box !== null]);

  // COPY-replace.marker_value: the colour under the marker (sampled as it moves).
  useEffect(() => {
    if (!mark || !mode) return undefined;
    let live = true;
    const id = setTimeout(() => {
      void playback
        .peek()
        ?.ctl.sample(mark.x, mark.y)
        .then((s) => {
          if (live && s) setMarkHex(s.hex);
        });
    }, MAGNIFIER_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [mark?.x, mark?.y, mode]);

  // Esc anywhere ends pick mode without a change (before the sheet or the picker hear it). Layout effects: the
  // listeners are in place as soon as the pill shows.
  useLayoutEffect(() => {
    if (!mode) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      endPick(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [mode]);

  // Pointer and touch picking. The layer takes every pointer over the frame: drags and pinches never reach the
  // placement or text overlays under it (RULE-25: they don't move or scale the clip).
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el || !mode) return undefined;
    let down: { id: number; touch: boolean } | null = null;
    let last = 0;
    let at: { x: number; y: number } | null = null;
    const frac = (e: PointerEvent): { x: number; y: number; cx: number; cy: number } => {
      const r = el.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / Math.max(1, r.width),
        y: (e.clientY - r.top) / Math.max(1, r.height),
        cx: e.clientX - r.left,
        cy: e.clientY - r.top,
      };
    };
    const inside = (f: { x: number; y: number }): boolean => f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1;
    const magnify = (e: PointerEvent): void => {
      const f = frac(e);
      at = f;
      const below = f.cy - LENS - LENS_GAP < 0;
      setLens((l) => ({ x: f.cx, y: f.cy, hex: l?.hex ?? null, below }));
      const now = performance.now();
      if (now - last < MAGNIFIER_MS) return;
      last = now;
      void playback
        .peek()
        ?.ctl.sample(f.x, f.y, VIEW)
        .then((s) => {
          if (!s || !down) return;
          setLens((l) => (l ? { ...l, hex: s.hex } : l));
          const c = lensCanvas.current;
          const g = c?.getContext('2d');
          if (!c || !g) return;
          c.width = s.side;
          c.height = s.side;
          // Near the frame's edge the block read is kept inside the frame: shift it so the finger's point is
          // under the centre ring (the uncovered part stays clear).
          g.clearRect(0, 0, s.side, s.side);
          const img = new ImageData(new Uint8ClampedArray(s.rgba), s.side, s.side);
          g.putImageData(img, Math.round(s.side / 2 - s.x), Math.round(s.side / 2 - s.y));
        });
    };
    const onDown = (e: PointerEvent): void => {
      if (down) {
        e.preventDefault(); // a second finger: no pinch
        return;
      }
      if (e.button !== 0) return;
      e.preventDefault();
      down = { id: e.pointerId, touch: e.pointerType === 'touch' };
      if (down.touch) magnify(e);
    };
    const onMove = (e: PointerEvent): void => {
      if (!down || e.pointerId !== down.id) return;
      e.preventDefault();
      if (down.touch) magnify(e);
    };
    const onUp = (e: PointerEvent): void => {
      if (!down || e.pointerId !== down.id) return;
      const wasTouch = down.touch;
      down = null;
      setLens(null);
      const f = wasTouch && at ? at : frac(e);
      at = null;
      // A mouse picks on release; a lift picks where the finger was. Outside the frame nothing happens.
      if (e.type === 'pointerup' && inside(f)) void pickAt(f.x, f.y);
    };
    const onTouchMove = (e: TouchEvent): void => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [mode]);

  if (!mode) return null;

  const onMarkerKey = (e: KeyboardEvent): void => {
    if (!mark || !box) return;
    const p = visiblePart(box);
    if (!p) return;
    const step = e.shiftKey ? 0.1 : 0.01;
    let { x, y } = mark;
    switch (e.key) {
      case 'ArrowLeft':
        x -= step;
        break;
      case 'ArrowRight':
        x += step;
        break;
      case 'ArrowUp':
        y -= step;
        break;
      case 'ArrowDown':
        y += step;
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        e.stopPropagation();
        void pickAt(x, y);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    // Kept within the clip's visible picture.
    x = Math.min(p.x1 / box.width, Math.max(p.x0 / box.width, x));
    y = Math.min(p.y1 / box.height, Math.max(p.y0 / box.height, y));
    // The colour under the new spot is read again; until then the value text reads "…", never the old colour.
    setMarkHex(null);
    setMark({ x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 });
  };

  const style = box
    ? { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }
    : undefined;
  const markValue = mark ? t('replace.marker_value', { hex: markHex ?? '…', x: pct(mark.x), y: pct(mark.y) }) : '';
  return (
    <>
      <div ref={layer} class="tk-pick-layer" data-picking="" style={style}>
        {/* A crosshair over the clip's picture, the normal pointer elsewhere. */}
        {part ? (
          <span
            class="tk-pick-layer__clip"
            aria-hidden="true"
            style={{
              left: `${part.x0}px`,
              top: `${part.y0}px`,
              width: `${part.x1 - part.x0}px`,
              height: `${part.y1 - part.y0}px`,
            }}
          />
        ) : null}
        {mark && box ? (
          <div
            ref={marker}
            class="tk-pick-marker"
            role="slider"
            tabIndex={0}
            aria-label={t('replace.marker')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct(mark.x)}
            aria-valuetext={markValue}
            data-control="pick-marker"
            data-hex={markHex ?? undefined}
            style={{ left: `${mark.x * box.width}px`, top: `${mark.y * box.height}px` }}
            onKeyDown={onMarkerKey}
          />
        ) : null}
        {lens ? (
          <span
            class="tk-pick-lens"
            aria-hidden="true"
            data-below={lens.below ? '' : undefined}
            style={{
              left: `${lens.x}px`,
              top: `${lens.below ? lens.y + LENS_GAP + LENS / 2 : lens.y - LENS_GAP - LENS / 2}px`,
              '--pick-ring': lens.hex ?? 'transparent',
            }}
            data-hex={lens.hex ?? undefined}
          >
            <canvas ref={lensCanvas} class="tk-pick-lens__view" width={VIEW} height={VIEW} />
            <span class="tk-pick-lens__ring" />
          </span>
        ) : null}
      </div>
      {/* CMP-Preview "picking a colour": the quiet pill with Cancel, top-left (the same pill recipe as compare). */}
      <div class="tk-pick-pill" data-section="pick-mode" style={barTop === null ? undefined : { top: `${barTop}px` }}>
        <span class="tk-pick-pill__text" role="status">
          <Icon name="eyedropper" size={14} />
          <span class="tk-pick-pill__lines">
            <span>{mode.keys ? t('replace.picking_keys') : t('replace.picking')}</span>
            <span class="tk-pick-pill__note">{t('replace.original')}</span>
          </span>
        </span>
        <button type="button" class="tk-pick-pill__cancel" data-action="pick-cancel" onClick={() => endPick(true)}>
          {t('replace.pick_cancel')}
        </button>
      </div>
    </>
  );
}
