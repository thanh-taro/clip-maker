// MOD-App — CMP-Preview "clip selected" (specs/30-experience/components/CMP-Preview.md): the violet
// placement outline (`previewOutline`) and eight white handles (`previewHandle`, `size.handle`; hit area
// `size.targetMin`, `size.handleHit` on touch) around the selected clip, over the preview canvas, and the
// on-preview gestures: dragging in the frame moves the clip (its centre snaps to the frame's centre lines
// within 8 screen pixels, a dashed violet guide showing the line it snapped to), a corner or edge handle
// scales it, and a two-finger pinch scales it. The geometry is MOD-Preview's (../preview/placement.ts),
// the edit MOD-App's drag gesture (./placement.ts): one drag is one undo step, measured from where it
// began, so back at its start it leaves none (Q104).
// Drag rules (the F-004 trim and F-005 slider lessons): the release is heard on the window (no pointer
// capture); a mouse move with no button down ends the drag; pointercancel and Esc put the clip back; a
// non-passive touchmove keeps the page from panning; undo, redo or any other edit mid-drag cuts it
// (F-014 `onCut`); the selection changing or the outline hiding ends it; losing the window ends it.
// The overlay is decorative for assistive technology: every gesture has a visible control in
// CMP-Inspector's Position section (RULE-21, NFR-06), so it is hidden from the accessibility tree.
// Snapping is always on until F-013 adds the Snapping toggle (RULE-14), as for the trim drag.
// Implements: F-006.R2, F-006.AC2, RULE-07 (*Snapping*), RULE-21 (*Preview*: drag moves, pinch scales),
// CMP-Preview "clip selected" and "Behavior" (dragging the selected clip moves it and pinching scales it;
// corner and edge handles scale).
import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Placement } from '../core';
import {
  HANDLES,
  handlePoints,
  moveFrom,
  pinchScale,
  scaleFrom,
  screenRect,
  type Handle,
  type Point,
  type Size,
} from '../preview';
import { beginPlacementDrag, placementShown, placementTarget, type PlacementDrag } from './placement';
import { playback } from './playback';
import { snapping } from './timeline-nav';

// RULE-14 snapping: the F-013 toggle (./timeline-nav.ts), for the timeline and the preview (F-013.R3).


export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Drag {
  readonly id: string;
  readonly mode: 'move' | 'scale';
  readonly handle: Handle | null;
  readonly touch: boolean;
  /** Pointers down on the overlay and where each is now (client pixels). */
  readonly pointers: Map<number, Point>;
  readonly first: number;
  readonly start: Point;
  readonly from: Placement;
  readonly frame: Size;
  /** The clip's centre in client pixels when the drag began. */
  readonly centre: Point;
  /** A second finger came down: the drag became a pinch from this distance and scale. */
  pinch: { readonly distance: number; readonly scale: number } | null;
  change: Partial<Placement>;
  session: PlacementDrag | null;
}

/** The preview canvas's box inside the stage (CSS pixels), followed as the canvas and stage resize. */
export function useCanvasBox(stage: RefObject<HTMLElement>): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    let canvas: HTMLCanvasElement | null = null;
    const measure = (): void => {
      const c = canvas;
      if (!c) return setBox(null);
      const s = el.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return setBox(null);
      const next = { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
      setBox((old) =>
        old && old.left === next.left && old.top === next.top && old.width === next.width && old.height === next.height
          ? old
          : next,
      );
    };
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    const find = (): void => {
      const c = el.querySelector<HTMLCanvasElement>('.tk-frame canvas');
      if (c !== canvas) {
        if (canvas) sizes.unobserve(canvas);
        if (c) sizes.observe(c);
        canvas = c;
      }
      measure();
    };
    // The canvas arrives when the preview mounts, and is replaced on a remount.
    const children = new MutationObserver(find);
    children.observe(el, { childList: true, subtree: true });
    find();
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, []);
  return box;
}

const CURSORS: Readonly<Record<Handle, string>> = {
  nw: 'nwse',
  se: 'nwse',
  ne: 'nesw',
  sw: 'nesw',
  n: 'ns',
  s: 'ns',
  e: 'ew',
  w: 'ew',
};

export function PlacementOverlay({ stage }: { readonly stage: RefObject<HTMLElement> }) {
  const box = useCanvasBox(stage);
  const target = placementTarget.value;
  const playing = playback.value?.ctl.state.value === 'playing';
  const visible = box !== null && target !== null && target.picture !== null && placementShown.value && !playing;
  const layer = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const drag = useRef<Drag | null>(null);
  /** Ends the drag: `commit` keeps it (one step), `cancel` puts the clip back, `abort` (cut) leaves it be. */
  const finish = useRef((how: 'commit' | 'cancel' | 'abort'): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (how === 'cancel') d.session?.cancel();
    else if (how === 'commit') d.session?.end();
    setGuides({ x: false, y: false });
    layer.current?.removeAttribute('data-dragging');
  });

  // The selection changing, or the outline going (playback, the playhead leaving the clip), ends a drag.
  const shownId = visible ? target.id : null;
  useEffect(() => () => finish.current('commit'), [shownId]);

  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const end = finish.current;

    const apply = (d: Drag): void => {
      const now = d.pointers.get(d.first) ?? d.start;
      let change: Partial<Placement>;
      if (d.pinch) {
        const [a, b] = [...d.pointers.values()];
        const distance = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : d.pinch.distance;
        change = { ...d.change, scale: pinchScale(d.pinch.scale, d.pinch.distance, distance) };
      } else if (d.mode === 'scale' && d.handle) {
        change = { scale: scaleFrom(d.from.scale, d.handle, d.centre, d.start, now) };
      } else {
        const m = moveFrom(d.from, now[0] - d.start[0], now[1] - d.start[1], d.frame, snapping.peek());
        change = { offsetX: m.offsetX, offsetY: m.offsetY };
        setGuides((g) => (g.x === m.snapX && g.y === m.snapY ? g : { x: m.snapX, y: m.snapY }));
      }
      d.change = change;
      if (!d.session) {
        // Nothing moved yet: no gesture, no step.
        if (now[0] === d.start[0] && now[1] === d.start[1] && !d.pinch) return;
        d.session = beginPlacementDrag(d.id, () => {
          if (drag.current === d) end('abort');
        });
        el.setAttribute('data-dragging', '');
      }
      d.session.set(change);
    };

    const onDown = (e: PointerEvent): void => {
      const d = drag.current;
      if (d) {
        // RULE-21: a second finger on the preview turns the drag into a pinch.
        if (d.touch && e.pointerType === 'touch' && d.pointers.size === 1 && !d.pinch) {
          e.preventDefault();
          d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
          const [a, b] = [...d.pointers.values()];
          const scale = typeof d.change.scale === 'number' ? d.change.scale : d.from.scale;
          d.pinch = { distance: a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0, scale };
          setGuides({ x: false, y: false });
        }
        return;
      }
      const t = placementTarget.peek();
      if (e.button !== 0 || !t?.picture || !el.isConnected || el.hidden) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      e.preventDefault();
      const handle = ((e.target as Element).closest<HTMLElement>('[data-handle]')?.dataset['handle'] ??
        null) as Handle | null;
      const frame = { width: r.width, height: r.height };
      const placed = screenRect(frame, t.picture, t.placement);
      drag.current = {
        id: t.id,
        mode: handle ? 'scale' : 'move',
        handle,
        touch: e.pointerType === 'touch',
        pointers: new Map([[e.pointerId, [e.clientX, e.clientY]]]),
        first: e.pointerId,
        start: [e.clientX, e.clientY],
        from: t.placement,
        frame,
        centre: [r.left + placed.cx, r.top + placed.cy],
        pinch: null,
        change: {},
        session: null,
      };
    };
    const onMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
      // The button was released where nothing heard it (outside the page): the drag is over.
      if (!d.touch && e.buttons === 0) {
        end('commit');
        return;
      }
      e.preventDefault();
      d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      apply(d);
    };
    const onUp = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
      // A cancelled pointer (the browser took the gesture) puts the clip back, as Esc does.
      end(e.type === 'pointerup' ? 'commit' : 'cancel');
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        end('cancel');
      }
    };
    const onTouchMove = (e: TouchEvent): void => {
      if (drag.current && e.cancelable) e.preventDefault();
    };
    const onBlur = (): void => end('commit');
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKey, true);
    return () => {
      end('commit');
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const placed = visible ? screenRect(box, target.picture!, target.placement) : null;
  const points = placed ? handlePoints(placed) : null;
  return (
    <div
      ref={layer}
      class="tk-place-layer"
      aria-hidden="true"
      hidden={!visible}
      data-clip-id={visible ? target.id : undefined}
      style={
        box
          ? { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }
          : undefined
      }
    >
      <span class="tk-place-layer__guide tk-place-layer__guide--x" hidden={!guides.x} />
      <span class="tk-place-layer__guide tk-place-layer__guide--y" hidden={!guides.y} />
      {placed ? (
        <span
          class="tk-place-layer__outline"
          style={{
            left: `${placed.cx - placed.width / 2}px`,
            top: `${placed.cy - placed.height / 2}px`,
            width: `${placed.width}px`,
            height: `${placed.height}px`,
          }}
        />
      ) : null}
      {points
        ? HANDLES.map((h) => (
            <span
              key={h}
              class={`tk-place-layer__handle tk-place-layer__handle--${CURSORS[h]}`}
              data-handle={h}
              style={{ left: `${points[h][0]}px`, top: `${points[h][1]}px` }}
            />
          ))
        : null}
    </div>
  );
}
