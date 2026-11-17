// MOD-App — the shared slider gesture of CMP-Inspector's sliders (Speed Exact F-005, Scale F-006, the
// twelve adjustments F-007): a key on the slider is one RULE-13 step; one pointer movement is one step
// (F-014 `beginGesture`, through the owner's `begin`), measured from where it began (Q104). A release
// anywhere (window pointerup / pointercancel), the window losing focus, the slider losing focus, or the
// slider's subject changing (`key`: another clip selected) ends the movement. No pointer capture: in
// WebKit a captured range input no longer drags its thumb. Outside edits (undo, redo, another edit) cut an
// open movement (Q96): the slider is controlled, so it shows the restored value, and the next move starts
// a new movement.
// Implements: RULE-13 (one slider movement is one step), CMP-Inspector "Behavior" (slider drags update the
// preview live and are one undo step per movement), F-014.AC4.
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** One movement of a slider, as the owner's rule module begins it (beginSpeedDrag, beginAdjustDrag, …). */
export interface SliderDrag {
  set(value: number): void;
  end(): void;
  /** False once ended, or once undo, redo, New project or an outside edit cut it. */
  readonly active: boolean;
}

export interface SliderGestureOptions {
  /** What the slider acts on (the clip id): when it changes mid-drag, the movement ends. */
  readonly key: unknown;
  /** The value the slider shows (restored while an orphaned pointer is still down). */
  readonly value: number;
  /** Begins a movement (its first move). */
  readonly begin: () => SliderDrag;
  /** A key on the slider: one step. */
  readonly step: (value: number) => void;
  /** The value now in effect after an input (a rule may hold or round it), or undefined to keep the input's. */
  readonly shown: () => number | undefined;
}

type Handlers = Pick<
  JSX.HTMLAttributes<HTMLInputElement>,
  'onPointerDown' | 'onInput' | 'onPointerUp' | 'onPointerCancel' | 'onBlur' | 'onChange'
>;

const RELEASE = ['pointerup', 'pointercancel', 'blur'] as const;

/** The range input's event handlers for one slider. */
export function useSliderGesture(options: SliderGestureOptions): Handlers {
  const latest = useRef(options);
  latest.current = options;
  const drag = useRef<SliderDrag | null>(null);
  /** A pointer went down on the slider and has not been released: its moves are one movement. */
  const held = useRef(false);
  /** The pointer that was dragging for the previous subject is still down: its moves are ignored. */
  const orphan = useRef(false);
  const endDrag = useRef((): void => {
    for (const type of RELEASE) removeEventListener(type, endDrag.current);
    held.current = false;
    drag.current?.end();
    drag.current = null;
  });
  // Another subject (clip) mid-drag, or the slider going away, ends the movement: its moves never reach the
  // new subject. A pointer still down for the previous one is ignored until it is released.
  useEffect(
    () => () => {
      if (held.current) {
        orphan.current = true;
        const clear = (): void => {
          orphan.current = false;
          for (const type of RELEASE) removeEventListener(type, clear);
        };
        for (const type of RELEASE) addEventListener(type, clear);
      }
      endDrag.current();
    },
    [options.key],
  );
  const end = endDrag.current;
  return {
    onPointerDown: () => {
      end();
      orphan.current = false;
      // A release anywhere (outside the slider or the page) or the window losing focus ends the movement.
      for (const type of RELEASE) addEventListener(type, end);
      held.current = true;
    },
    onInput: (e) => {
      const input = e.currentTarget;
      const v = Number(input.value);
      const o = latest.current;
      if (orphan.current) {
        input.value = String(o.value);
        return;
      }
      if (held.current) {
        // The movement starts with its first move; a cut movement is begun again from the project as it is.
        if (!drag.current?.active) drag.current = o.begin();
        drag.current.set(v);
      } else {
        o.step(v);
      }
      // Controlled: when a rule held or rounded the value, the thumb shows the value in effect.
      input.value = String(o.shown() ?? v);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onBlur: end,
    onChange: end,
  };
}
