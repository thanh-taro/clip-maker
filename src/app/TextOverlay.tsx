// MOD-App — CMP-Preview "text selected, moving" (specs/30-experience/components/CMP-Preview.md): over the
// preview, each text layer shown at the playhead has a hit area at its block (a tap or click selects it, a
// double-click or double-tap opens CMP-TextEditor on it); the selected one has the violet outline and the
// white handles. Dragging the selected text moves it (its centre snaps to the frame's centre lines and its
// nearest edge to a safe margin within 8 screen pixels, the centre lines and safe margins showing as dashed
// violet guides while it moves, RULE-11); a handle drag or a two-finger pinch scales its size (RULE-21). The
// geometry is MOD-Preview's (../preview/text-place.ts); one drag is one undo step, measured from where it
// began, so back at its start it leaves none (Q104).
// Drag rules (the F-004 trim, F-005 slider and F-006 placement lessons): the release is heard on the window;
// a mouse move with no button down ends the drag; pointercancel and Esc put the text back; a non-passive
// touchmove keeps the page from panning; undo, redo or any other edit mid-drag cuts it (F-014 `onCut`); the
// selection changing or the overlay hiding ends it; losing the window ends it.
// The overlay is decorative for assistive technology: every gesture has a visible control in the text
// section's Position fields and nudges, and the Size slider (RULE-21, NFR-06).
// Snapping is always on until F-013 adds the Snapping toggle (RULE-14), as for the clip placement drag.
// Implements: F-010.R3, F-010.AC3, RULE-11 (*Position* and snapping), RULE-21 (*Selecting*: a tap selects;
// *Preview*: dragging the selected text moves it, pinching scales it), CMP-TextEditor "Behavior" (opens when
// a text layer is double-clicked / tapped).
import { computed } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { frameIndexAt, projectEnd, RULE_11, type TextLayer } from '../core';
import {
  canvasMeasure,
  HANDLES,
  handlePoints,
  layoutText,
  moveText,
  pinchTextSize,
  textSizeFrom,
  type Point,
  type Size,
} from '../preview';
import { playhead, project } from '../project';
import { useCanvasBox } from './PlacementOverlay';
import { playback } from './playback';
import { snapping } from './timeline-nav';
import { beginTextDrag, editingText, editLayer, selectText, selectedText, type TextDrag } from './text';
import { pickMode } from './pick';

// RULE-14 snapping: the F-013 toggle (./timeline-nav.ts), for the timeline and the preview (F-013.R3).

/** Two taps within this time on the same layer are a double-tap (CMP-TextEditor "Behavior"). */
const DOUBLE_TAP_MS = 350;

/** The text layers shown at the playhead (INV-07: nothing past the project end), bottom to top. */
const shownTexts = computed<readonly TextLayer[]>(() => {
  const p = project.value;
  const rate = p.frame.frameRate;
  const k = frameIndexAt(playhead.value, rate);
  // INV-07: nothing at or past the project end is drawn (an empty main track ends at 0).
  if (playhead.value >= projectEnd(p)) return [];
  return p.textLayers.filter(
    (t) => t.content.trim() !== '' && frameIndexAt(t.start, rate) <= k && k < frameIndexAt(t.end, rate),
  );
});

interface Drag {
  readonly id: string;
  readonly mode: 'move' | 'scale';
  readonly touch: boolean;
  readonly pointers: Map<number, Point>;
  readonly first: number;
  readonly start: Point;
  readonly from: TextLayer;
  readonly frame: Size;
  readonly block: Size;
  readonly centre: Point;
  pinch: { readonly distance: number; readonly size: number } | null;
  session: TextDrag | null;
}

const CURSORS: Readonly<Record<string, string>> = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };

export function TextOverlay({ stage }: { readonly stage: RefObject<HTMLElement> }) {
  const box = useCanvasBox(stage);
  const playing = playback.value?.ctl.state.value === 'playing';
  const editing = editingText.value;
  const shown = shownTexts.value;
  const selected = selectedText.value;
  // RULE-25 pick mode shows no text layers (the clip beneath is sampled).
  const visible = box !== null && !playing && editing === null && shown.length > 0 && !pickMode.value;
  const layer = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null; on: boolean }>({
    x: null,
    y: null,
    on: false,
  });
  const drag = useRef<Drag | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const finish = useRef((how: 'commit' | 'cancel' | 'abort'): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (how === 'cancel') d.session?.cancel();
    else if (how === 'commit') d.session?.end();
    setGuides({ x: null, y: null, on: false });
    layer.current?.removeAttribute('data-dragging');
  });

  // The selection changing, or the overlay going (playback, editing), ends a drag.
  const shownId = visible && selected ? selected.id : null;
  useEffect(() => () => finish.current('commit'), [shownId]);

  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const end = finish.current;
    const measure = canvasMeasure();

    const apply = (d: Drag): void => {
      const now = d.pointers.get(d.first) ?? d.start;
      let change: { x?: number; y?: number; size?: number };
      if (d.pinch) {
        const [a, b] = [...d.pointers.values()];
        const distance = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : d.pinch.distance;
        change = { size: pinchTextSize(d.pinch.size, d.pinch.distance, distance) };
      } else if (d.mode === 'scale') {
        change = { size: textSizeFrom(d.from.size, d.centre, d.start, now) };
      } else {
        const m = moveText(d.from, now[0] - d.start[0], now[1] - d.start[1], d.frame, d.block, snapping.peek());
        change = { x: m.x, y: m.y };
        setGuides((g) => (g.x === m.snapX && g.y === m.snapY && g.on ? g : { x: m.snapX, y: m.snapY, on: true }));
      }
      if (!d.session) {
        // Nothing moved yet: no gesture, no step.
        if (now[0] === d.start[0] && now[1] === d.start[1] && !d.pinch) return;
        d.session = beginTextDrag(d.id, () => {
          if (drag.current === d) end('abort');
        });
        el.setAttribute('data-dragging', '');
      }
      d.session.set(change);
    };

    const onDown = (e: PointerEvent): void => {
      const d = drag.current;
      if (d) {
        // RULE-21: a second finger on the preview turns the drag into a pinch of the text's size.
        if (d.touch && e.pointerType === 'touch' && d.pointers.size === 1 && !d.pinch) {
          e.preventDefault();
          d.pointers.set(e.pointerId, [e.clientX, e.clientY]);
          const [a, b] = [...d.pointers.values()];
          const size = project.peek().textLayers.find((t) => t.id === d.id)?.size ?? d.from.size;
          d.pinch = { distance: a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0, size };
          setGuides({ x: null, y: null, on: false });
        }
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>('[data-text-id]');
      const id = target?.dataset['textId'];
      if (e.button !== 0 || id === undefined || !el.isConnected) return;
      const t = project.peek().textLayers.find((x) => x.id === id);
      if (!t) return;
      e.preventDefault();
      // RULE-21: a tap or click selects; a second tap (or a double-click) on the same layer edits it.
      const touch = e.pointerType === 'touch';
      const now = performance.now();
      if (touch && lastTap.current?.id === id && now - lastTap.current.at < DOUBLE_TAP_MS) {
        lastTap.current = null;
        editLayer(id);
        return;
      }
      lastTap.current = { id, at: now };
      const wasSelected = selectedText.peek()?.id === id;
      if (!wasSelected) selectText(id);
      // On touch only the selected text drags (a tap on another selects it); a mouse can drag at once.
      if (touch && !wasSelected) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const frame = { width: r.width, height: r.height };
      const l = layoutText(t, r.width, r.height, measure);
      const handle = (e.target as Element).closest<HTMLElement>('[data-handle]')?.dataset['handle'] ?? null;
      drag.current = {
        id,
        mode: handle ? 'scale' : 'move',
        touch,
        pointers: new Map([[e.pointerId, [e.clientX, e.clientY]]]),
        first: e.pointerId,
        start: [e.clientX, e.clientY],
        from: t,
        frame,
        block: { width: l.width, height: l.height },
        centre: [r.left + t.x * r.width, r.top + t.y * r.height],
        pinch: null,
        session: null,
      };
    };
    const onMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
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
    const onDouble = (e: MouseEvent): void => {
      const id = (e.target as Element).closest<HTMLElement>('[data-text-id]')?.dataset['textId'];
      if (id !== undefined) editLayer(id);
    };
    const onBlur = (): void => end('commit');
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('dblclick', onDouble);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKey, true);
    return () => {
      end('commit');
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('dblclick', onDouble);
      el.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const measure = canvasMeasure();
  const blocks = visible
    ? shown.map((t) => {
        const l = layoutText(t, box.width, box.height, measure);
        return { t, cx: t.x * box.width, cy: t.y * box.height, width: l.width, height: l.height };
      })
    : [];
  const sel = blocks.find((b) => b.t.id === selected?.id) ?? null;
  const points = sel ? handlePoints({ cx: sel.cx, cy: sel.cy, width: sel.width, height: sel.height }) : null;
  const margin = RULE_11.safeMargin * 100;
  return (
    <div
      ref={layer}
      class="tk-text-layer"
      aria-hidden="true"
      hidden={!visible}
      style={
        box
          ? { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }
          : undefined
      }
    >
      {guides.on ? (
        <>
          <span
            class="tk-text-layer__guide tk-text-layer__guide--v"
            data-snapped={guides.x === 0.5 ? '' : undefined}
            style={{ left: '50%' }}
          />
          <span
            class="tk-text-layer__guide tk-text-layer__guide--h"
            data-snapped={guides.y === 0.5 ? '' : undefined}
            style={{ top: '50%' }}
          />
          <span
            class="tk-text-layer__guide tk-text-layer__guide--v"
            data-snapped={guides.x === RULE_11.safeMargin ? '' : undefined}
            style={{ left: `${margin}%` }}
          />
          <span
            class="tk-text-layer__guide tk-text-layer__guide--v"
            data-snapped={guides.x === 1 - RULE_11.safeMargin ? '' : undefined}
            style={{ left: `${100 - margin}%` }}
          />
          <span
            class="tk-text-layer__guide tk-text-layer__guide--h"
            data-snapped={guides.y === RULE_11.safeMargin ? '' : undefined}
            style={{ top: `${margin}%` }}
          />
          <span
            class="tk-text-layer__guide tk-text-layer__guide--h"
            data-snapped={guides.y === 1 - RULE_11.safeMargin ? '' : undefined}
            style={{ top: `${100 - margin}%` }}
          />
        </>
      ) : null}
      {blocks.map((b) => (
        <span
          key={b.t.id}
          class="tk-text-layer__hit"
          data-text-id={b.t.id}
          data-selected={b.t.id === selected?.id ? '' : undefined}
          style={{
            left: `${b.cx - b.width / 2}px`,
            top: `${b.cy - b.height / 2}px`,
            width: `${b.width}px`,
            height: `${b.height}px`,
          }}
        />
      ))}
      {points && sel
        ? HANDLES.filter((h) => h.length === 2).map((h) => (
            <span
              key={h}
              class={`tk-place-layer__handle tk-place-layer__handle--${CURSORS[h]}`}
              data-handle={h}
              data-text-id={sel.t.id}
              style={{ left: `${points[h][0]}px`, top: `${points[h][1]}px` }}
            />
          ))
        : null}
    </div>
  );
}
