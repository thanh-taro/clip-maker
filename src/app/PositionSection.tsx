// MOD-App — CMP-Inspector's Position section (specs/30-experience/components/CMP-Inspector.md "clip
// Position"; CMP-Timeline "narrow / sheet open" for the phone rows): the heading Position
// (COPY-inspector.placement) with Reset (COPY-action.reset); Fit/Fill (COPY-placement.fit,
// COPY-placement.fill) as equal segments named COPY-placement.mode; Scale (COPY-placement.scale) slider and
// field (50–400 %); Offset (COPY-placement.offset) with the X and Y fields (COPY-placement.offset_x,
// COPY-placement.offset_y, in % of the frame); one row of the four nudges (COPY-placement.nudge_*), Rotate
// (COPY-action.rotate) and the Flip horizontal / Flip vertical toggles (COPY-action.flip_h,
// COPY-action.flip_v). First in a clip's Edit tab. On narrow layouts the Edit sheet shows, at touch size, a
// Position row (label on the left, Fit/Fill, then the four nudges) and a Scale slider row as the board,
// then a row with Rotate, the flips and Reset (build question 133).
// Implements: F-006.R1, F-006.R3, F-006.R4, F-006.R5 (scale and position by visible controls; a nudge is
// 1 %, 10 % with Shift — RULE-07), F-006 UX notes, CMP-Inspector "Behavior" (slider drags update the preview
// live and are one undo step per movement; fields accept typed values and clamp to the rule's range) and
// "Accessibility" (Fit/Fill is a radio group; the flips expose a pressed state; the slider and its field
// share the label Scale), RULE-21 (preview drag and pinch → these placement controls).
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../copy';
import { RULE_07, type Placement } from '../core';
import { Icon, type IconName } from './icons';
import { NumberField } from './NumberField';
import { OptionGroup, type Option } from './OptionGroup';
import {
  beginPlacementDrag,
  flipClip,
  nudgeClip,
  OFFSET_LIMIT,
  placementTarget,
  resetClipPlacement,
  rotateClip,
  setPlacementOnce,
  type NudgeDirection,
  type PlacementDrag,
} from './placement';

const NUDGES: readonly { dir: NudgeDirection; icon: IconName; label: `placement.nudge_${NudgeDirection}` }[] = [
  { dir: 'left', icon: 'nudgeLeft', label: 'placement.nudge_left' },
  { dir: 'up', icon: 'nudgeUp', label: 'placement.nudge_up' },
  { dir: 'down', icon: 'nudgeDown', label: 'placement.nudge_down' },
  { dir: 'right', icon: 'nudgeRight', label: 'placement.nudge_right' },
];

/** An offset (a fraction of the frame) as the field's percent, with no float noise. */
const pct = (offset: number): number => Math.round(offset * 10_000) / 100;

function IconButton({
  icon,
  label,
  action,
  pressed,
  onActivate,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly action: string;
  readonly pressed?: boolean;
  /** `big`: Shift was held (RULE-07: a nudge with Shift moves 10 %). */
  readonly onActivate: (big: boolean) => void;
}) {
  return (
    <button
      type="button"
      class="tk-icon-button tk-place__button"
      aria-label={label}
      title={label}
      data-action={action}
      aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}
      onClick={(e) => onActivate(e.shiftKey)}
      onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
        // Shift+Enter / Shift+Space: browsers don't all pass Shift on to the click a key makes.
        if (e.shiftKey && (e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          onActivate(true);
        }
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/** The Scale slider: keys are one step each; one pointer movement is one step (F-014 gesture, Q104). */
function ScaleSlider({ id, scale, labelledBy }: { id: string; scale: number; labelledBy: string }) {
  const drag = useRef<PlacementDrag | null>(null);
  const held = useRef(false);
  /** Ends the movement; also bound to the window's pointerup / pointercancel while one is open. */
  const endDrag = useRef((): void => {
    removeEventListener('pointerup', endDrag.current);
    removeEventListener('pointercancel', endDrag.current);
    held.current = false;
    drag.current?.end();
    drag.current = null;
  });
  // Another clip becoming the selection mid-drag ends the movement: its moves never reach that clip. The
  // pointer still down for the previous clip is ignored until it is released.
  const orphan = useRef(false);
  useEffect(
    () => () => {
      if (held.current) {
        orphan.current = true;
        const clear = (): void => {
          orphan.current = false;
          removeEventListener('pointerup', clear);
          removeEventListener('pointercancel', clear);
        };
        addEventListener('pointerup', clear);
        addEventListener('pointercancel', clear);
      }
      endDrag.current();
    },
    [id],
  );
  const end = endDrag.current;
  return (
    <input
      type="range"
      class="tk-place__slider"
      min={RULE_07.minScale}
      max={RULE_07.maxScale}
      step={1}
      value={scale}
      aria-labelledby={labelledBy}
      aria-valuetext={`${scale} %`}
      data-control="scale-slider"
      onPointerDown={() => {
        end();
        orphan.current = false;
        // A release anywhere ends the movement. No pointer capture: in WebKit a captured range input no
        // longer drags its thumb.
        addEventListener('pointerup', end);
        addEventListener('pointercancel', end);
        held.current = true;
      }}
      onInput={(e) => {
        const v = Number(e.currentTarget.value);
        if (orphan.current) {
          e.currentTarget.value = String(scale);
          return;
        }
        if (held.current) {
          if (!drag.current?.active) drag.current = beginPlacementDrag(id, () => undefined);
          drag.current.set({ scale: v });
        } else {
          setPlacementOnce(id, { scale: v });
        }
        e.currentTarget.value = String(placementTarget.peek()?.placement.scale ?? v);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onBlur={end}
      onChange={end}
    />
  );
}

function ScaleRow({ prefix, id, p }: { prefix: string; id: string; p: Placement }) {
  const scaleId = `${prefix}-scale`;
  return (
    <div class="tk-place__control" data-row="scale">
      <span class="tk-place__label" id={scaleId}>
        {t('placement.scale')}
      </span>
      <ScaleSlider id={id} scale={p.scale} labelledBy={scaleId} />
      <span class="tk-place__field">
        <NumberField
          class="tk-place__number"
          control="scale-field"
          min={RULE_07.minScale}
          max={RULE_07.maxScale}
          value={p.scale}
          labelledBy={scaleId}
          onCommit={(v) => setPlacementOnce(id, { scale: v }).scale}
        />
        <span class="tk-place__unit" aria-hidden="true">
          %
        </span>
      </span>
    </div>
  );
}

/**
 * The nudge order of each board: CMP-Inspector "clip Position" reads left, right, up, down; the phone
 * Edit sheet (CMP-Timeline "narrow / sheet open", SCR-Editor selected narrow) left, up, down, right.
 */
const ORDER: Readonly<Record<'inspector' | 'sheet', readonly NudgeDirection[]>> = {
  inspector: ['left', 'right', 'up', 'down'],
  sheet: ['left', 'up', 'down', 'right'],
};

function Nudges({ id, touch }: { id: string; touch: boolean }) {
  return (
    <>
      {ORDER[touch ? 'sheet' : 'inspector']
        .map((dir) => NUDGES.find((n) => n.dir === dir)!)
        .map((n) => (
          <IconButton
            key={n.dir}
            icon={n.icon}
            label={t(n.label)}
            action={`nudge-${n.dir}`}
            onActivate={(big) => nudgeClip(id, n.dir, big)}
          />
        ))}
    </>
  );
}

function TurnButtons({ id, p }: { id: string; p: Placement }) {
  return (
    <>
      <IconButton icon="rotate" label={t('action.rotate')} action="rotate" onActivate={() => rotateClip(id)} />
      <IconButton
        icon="flipH"
        label={t('action.flip_h')}
        action="flip-h"
        pressed={p.flipH}
        onActivate={() => flipClip(id, 'h')}
      />
      <IconButton
        icon="flipV"
        label={t('action.flip_v')}
        action="flip-v"
        pressed={p.flipV}
        onActivate={() => flipClip(id, 'v')}
      />
    </>
  );
}

function ResetButton({ id, changed }: { id: string; changed: boolean }) {
  return (
    <button
      type="button"
      class="tk-button tk-place__reset"
      data-action="reset-placement"
      // Unavailable at the defaults; aria-disabled keeps focus on it after a reset (keyboard use).
      aria-disabled={changed ? undefined : 'true'}
      onClick={() => {
        if (changed) resetClipPlacement(id);
      }}
    >
      <Icon name="reset" size={14} />
      {t('action.reset')}
    </button>
  );
}

export function PositionSection({ id: prefix, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = placementTarget.value;
  if (!target) return null;
  const { id, placement: p, changed } = target;
  const headId = `${prefix}-title`;
  const offsetId = `${prefix}-offset`;
  const xId = `${prefix}-offset-x`;
  const yId = `${prefix}-offset-y`;
  const modes: Option<Placement['mode']>[] = [
    { value: 'fit', key: 'fit', label: t('placement.fit') },
    { value: 'fill', key: 'fill', label: t('placement.fill') },
  ];
  const modeId = `${prefix}-mode-label`;
  const mode = (labelledBy: string) => (
    <OptionGroup
      id={`${prefix}-mode`}
      label={t('placement.mode')}
      labelledBy={labelledBy}
      options={modes}
      value={p.mode}
      onChoose={(m) => setPlacementOnce(id, { mode: m })}
      variant="segments"
    />
  );
  if (touch)
    return (
      <section
        class="tk-place tk-place--touch"
        data-section="placement"
        aria-labelledby={headId}
        data-changed={changed ? '' : undefined}
      >
        {/* Phone: the Position row with its label on the left (CMP-Timeline "narrow / sheet open"). */}
        <div class="tk-place__row">
          <h3 class="tk-place__row-label" id={headId}>
            {t('inspector.placement')}
          </h3>
          {mode(headId)}
          <div class="tk-place__buttons">
            <Nudges id={id} touch />
          </div>
        </div>
        <ScaleRow prefix={prefix} id={id} p={p} />
        <div class="tk-place__buttons tk-place__buttons--turn">
          <TurnButtons id={id} p={p} />
          <ResetButton id={id} changed={changed} />
        </div>
      </section>
    );
  const offsetField = (fieldId: string, label: 'placement.offset_x' | 'placement.offset_y', axis: 'x' | 'y') => (
    <span class="tk-place__xy">
      <span class="tk-place__sublabel" id={fieldId}>
        {t(label)}
      </span>
      <span class="tk-place__field">
        <NumberField
          class="tk-place__number"
          control={`offset-${axis}`}
          min={-OFFSET_LIMIT * 100}
          max={OFFSET_LIMIT * 100}
          fractionDigits={1}
          value={pct(axis === 'x' ? p.offsetX : p.offsetY)}
          labelledBy={fieldId}
          onCommit={(v) => {
            const now = setPlacementOnce(id, axis === 'x' ? { offsetX: v / 100 } : { offsetY: v / 100 });
            return pct(axis === 'x' ? now.offsetX : now.offsetY);
          }}
        />
        <span class="tk-place__unit" aria-hidden="true">
          %
        </span>
      </span>
    </span>
  );
  return (
    <section class="tk-place" data-section="placement" aria-labelledby={headId} data-changed={changed ? '' : undefined}>
      <div class="tk-place__head">
        <h3 class="tk-place__title" id={headId}>
          {t('inspector.placement')}
        </h3>
        <ResetButton id={id} changed={changed} />
      </div>
      <span class="tk-place__hidden" id={modeId}>
        {t('placement.mode')}
      </span>
      {mode(modeId)}
      <ScaleRow prefix={prefix} id={id} p={p} />
      <div class="tk-place__offset" role="group" aria-labelledby={offsetId}>
        <span class="tk-field__label" id={offsetId}>
          {t('placement.offset')}
        </span>
        <div class="tk-place__offsets">
          {offsetField(xId, 'placement.offset_x', 'x')}
          {offsetField(yId, 'placement.offset_y', 'y')}
        </div>
      </div>
      <div class="tk-place__buttons">
        <Nudges id={id} touch={false} />
        <span class="tk-place__divider" aria-hidden="true" />
        <TurnButtons id={id} p={p} />
      </div>
    </section>
  );
}
