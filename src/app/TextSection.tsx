// MOD-App — CMP-Inspector's text layer section (specs/30-experience/components/CMP-Inspector.md "text
// layer"; board CMP-Inspector text layer, SCR-Editor editing-text wide and narrow): Font (COPY-text.typeface),
// the one font picker — a two-by-two grid of touch-size tiles, each with an "Aa" sample in its face and the
// face's name; Style (COPY-text.style: Plain, Outline, Shadow, Box) as equal segments; Colour swatches named
// COPY-colour.*; Box colour (COPY-text.box_colour) while Box is chosen; Size (COPY-text.size) slider and
// field; Alignment (COPY-text.align_left/centre/right); Fade (COPY-text.fade) as a toggle; Position
// (COPY-text.position) with the X and Y fields (COPY-text.position_x/_y, % of the frame) and the four nudges;
// then Earlier / Later (COPY-action.time_earlier / time_later) and Bring forward / Send back
// (COPY-text.bring_forward / send_back), reached by scrolling. The title row's Reset is `TextReset`.
// `touch`: the phone Text sheet's touch-size rows (CMP-Inspector "narrow sheets").
// Implements: F-010.R2 (typeface, size, colour, style, alignment, fade), F-010.R3 (position by visible
// controls), F-010.R7 (bring forward / send back), F-010.R8 (Earlier / Later without dragging), RULE-11,
// RULE-21 (preview drag → the text position controls; hold-and-drag → the time controls), CMP-Inspector
// "Behavior" (one step per control, one per slider movement; fields clamp to the rule's range) and
// "Accessibility" (option groups are radio groups; swatches carry colour names; toggles expose a pressed
// state; the slider and its field share the label).
import type { JSX } from 'preact';
import { t } from '../copy';
import { PALETTE, RULE_11, contrastOf, type TextLayer } from '../core';
import { TEXT_FACES } from '../preview';
import { Icon, type IconName } from './icons';
import { NumberField } from './NumberField';
import { OptionGroup, type Option } from './OptionGroup';
import { useSliderGesture } from './slider-gesture';
import {
  beginTextDrag,
  moveTextBy,
  nudgeText,
  resetText,
  restack,
  selectedText,
  stackAvailable,
  styleText,
  textAtDefaults,
  textMoveAvailable,
  type TextNudge,
} from './text';

/** The type specimen on each font tile (the same in every language: a sample of the face, not a word). */
const SPECIMEN = 'Aa';

type Face = TextLayer['typeface'];
const FACES: readonly Face[] = ['sans', 'display', 'serif', 'rounded'];
const STYLES: readonly TextLayer['style'][] = ['plain', 'outline', 'shadow', 'box'];
const ALIGNS: readonly { value: TextLayer['align']; icon: IconName; label: `text.align_${TextLayer['align']}` }[] = [
  { value: 'left', icon: 'alignLeft', label: 'text.align_left' },
  { value: 'centre', icon: 'alignCentre', label: 'text.align_centre' },
  { value: 'right', icon: 'alignRight', label: 'text.align_right' },
];
const NUDGES: readonly { dir: TextNudge; icon: IconName; label: `placement.nudge_${TextNudge}` }[] = [
  { dir: 'left', icon: 'nudgeLeft', label: 'placement.nudge_left' },
  { dir: 'right', icon: 'nudgeRight', label: 'placement.nudge_right' },
  { dir: 'up', icon: 'nudgeUp', label: 'placement.nudge_up' },
  { dir: 'down', icon: 'nudgeDown', label: 'placement.nudge_down' },
];

/** A position (a fraction of the frame) as the field's percent, with no float noise. */
const pct = (v: number): number => Math.round(v * 10_000) / 100;

/** The font picker's options: "Aa" in the face, and its name (CMP-Inspector "text layer"). */
export function faceOptions(): Option<Face>[] {
  return FACES.map((f) => ({
    value: f,
    key: f,
    label: t(`text.${f}`),
    content: (
      <>
        <span
          class="tk-face__sample"
          aria-hidden="true"
          style={{ fontFamily: `"${TEXT_FACES[f].family}"`, fontWeight: TEXT_FACES[f].weight }}
        >
          {SPECIMEN}
        </span>
        <span class="tk-face__name">{t(`text.${f}`)}</span>
      </>
    ),
  }));
}

export const styleOptions = (): Option<TextLayer['style']>[] =>
  STYLES.map((s) => ({ value: s, key: s, label: t(`text.${s}`) }));

export const colourOptions = (): Option<TextLayer['colour']>[] =>
  PALETTE.map((c) => ({ value: c, key: c, label: t(`colour.${c}`), swatch: true }));

/** CMP-Inspector "text layer": the title row's Reset (unavailable at the defaults; focus stays on it). */
export function TextReset({ layer }: { readonly layer: TextLayer }) {
  const changed = !textAtDefaults(layer);
  return (
    <button
      type="button"
      class="tk-button tk-place__reset"
      data-action="reset-text"
      aria-disabled={changed ? undefined : 'true'}
      onClick={() => {
        if (changed) resetText(layer.id);
      }}
    >
      <Icon name="reset" size={14} />
      {t('action.reset')}
    </button>
  );
}

/** The Size slider: keys are one step each; one pointer movement is one step (F-014 gesture, Q104). */
function SizeSlider({ layer, labelledBy }: { readonly layer: TextLayer; readonly labelledBy: string }) {
  const gesture = useSliderGesture({
    key: layer.id,
    value: layer.size,
    begin: () => {
      const d = beginTextDrag(layer.id, () => undefined);
      return {
        set: (v) => d.set({ size: v }),
        end: () => d.end(),
        get active() {
          return d.active;
        },
      };
    },
    step: (v) => void styleText(layer.id, { size: v }),
    shown: () => selectedText.peek()?.size,
  });
  return (
    <input
      type="range"
      class="tk-place__slider"
      min={RULE_11.minSize}
      max={RULE_11.maxSize}
      step={1}
      value={layer.size}
      aria-labelledby={labelledBy}
      aria-valuetext={`${layer.size} %`}
      data-control="text-size-slider"
      {...gesture}
    />
  );
}

function TextButton({
  icon,
  label,
  action,
  disabled,
  onActivate,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly action: string;
  readonly disabled: boolean;
  readonly onActivate: () => void;
}) {
  return (
    <button
      type="button"
      class="tk-button tk-text__action"
      data-action={action}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onActivate();
      }}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  );
}

export function TextSection({ id: prefix, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const layer = selectedText.value;
  if (!layer) return null;
  const id = layer.id;
  const sizeId = `${prefix}-size`;
  const posId = `${prefix}-position`;
  const xId = `${prefix}-x`;
  const yId = `${prefix}-y`;
  const fadeId = `${prefix}-fade`;
  const move = textMoveAvailable.value;
  const stack = stackAvailable.value;
  const aligns: Option<TextLayer['align']>[] = ALIGNS.map((a) => ({
    value: a.value,
    key: a.value,
    label: t(a.label),
    named: true,
    content: <Icon name={a.icon} size={16} />,
  }));
  const positionField = (fieldId: string, label: 'text.position_x' | 'text.position_y', axis: 'x' | 'y') => (
    <span class="tk-place__xy">
      <span class="tk-place__sublabel" id={fieldId}>
        {t(label)}
      </span>
      <span class="tk-place__field">
        <NumberField
          class="tk-place__number"
          control={`text-${axis}`}
          min={0}
          max={100}
          fractionDigits={1}
          value={pct(layer[axis])}
          labelledBy={fieldId}
          onCommit={(v) => pct(styleText(id, { [axis]: v / 100 })?.[axis] ?? 0)}
        />
        <span class="tk-place__unit" aria-hidden="true">
          %
        </span>
      </span>
    </span>
  );
  return (
    <div class={touch ? 'tk-text tk-text--touch' : 'tk-text'} data-section="text">
      <OptionGroup
        id={`${prefix}-face`}
        label={t('text.typeface')}
        options={faceOptions()}
        value={layer.typeface}
        onChoose={(f) => styleText(id, { typeface: f })}
        variant="tiles"
      />
      <OptionGroup
        id={`${prefix}-style`}
        label={t('text.style')}
        options={styleOptions()}
        value={layer.style}
        onChoose={(s) => styleText(id, { style: s })}
        variant="segments"
      />
      <OptionGroup
        id={`${prefix}-colour`}
        label={t('text.colour')}
        options={colourOptions()}
        value={layer.colour}
        onChoose={(c) => styleText(id, { colour: c })}
        variant="swatches"
      />
      {layer.style === 'box' ? (
        <OptionGroup
          id={`${prefix}-box`}
          label={t('text.box_colour')}
          options={colourOptions()}
          value={layer.boxColour ?? contrastOf(layer.colour)}
          onChoose={(c) => styleText(id, { boxColour: c })}
          variant="swatches"
        />
      ) : null}
      <div class="tk-place__control" data-row="text-size">
        <span class="tk-place__label" id={sizeId}>
          {t('text.size')}
        </span>
        <SizeSlider layer={layer} labelledBy={sizeId} />
        <span class="tk-place__field">
          <NumberField
            class="tk-place__number"
            control="text-size-field"
            min={RULE_11.minSize}
            max={RULE_11.maxSize}
            value={layer.size}
            labelledBy={sizeId}
            onCommit={(v) => styleText(id, { size: Math.round(v) })?.size ?? v}
          />
          <span class="tk-place__unit" aria-hidden="true">
            %
          </span>
        </span>
      </div>
      <div class="tk-text__row">
        <div class="tk-text__align">
          <OptionGroup
            id={`${prefix}-align`}
            label={t('text.align')}
            options={aligns}
            value={layer.align}
            onChoose={(a) => styleText(id, { align: a })}
            variant="segments"
          />
        </div>
        <div class="tk-text__fade">
          <span class="tk-field__label" id={fadeId}>
            {t('text.fade')}
          </span>
          <button
            type="button"
            class="tk-switch"
            aria-pressed={layer.fade ? 'true' : 'false'}
            aria-labelledby={fadeId}
            data-control="text-fade"
            onClick={() => styleText(id, { fade: !layer.fade })}
          >
            <span class="tk-switch__knob" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="tk-place__offset" role="group" aria-labelledby={posId}>
        <span class="tk-field__label" id={posId}>
          {t('text.position')}
        </span>
        <div class="tk-place__offsets">
          {positionField(xId, 'text.position_x', 'x')}
          {positionField(yId, 'text.position_y', 'y')}
        </div>
        <div class="tk-place__buttons">
          {NUDGES.map((n) => (
            <button
              key={n.dir}
              type="button"
              class="tk-icon-button tk-place__button"
              aria-label={t(n.label)}
              title={t(n.label)}
              data-action={`text-nudge-${n.dir}`}
              onClick={(e) => nudgeText(id, n.dir, e.shiftKey)}
              onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
                // Shift+Enter / Shift+Space: browsers don't all pass Shift on to the click a key makes.
                if (e.shiftKey && (e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                  e.preventDefault();
                  nudgeText(id, n.dir, true);
                }
              }}
            >
              <Icon name={n.icon} size={16} />
            </button>
          ))}
        </div>
      </div>
      <div class="tk-text__actions">
        <TextButton
          icon="moveEarlier"
          label={t('action.time_earlier')}
          action="text-earlier"
          disabled={!move.earlier}
          onActivate={() => moveTextBy(-1)}
        />
        <TextButton
          icon="moveLater"
          label={t('action.time_later')}
          action="text-later"
          disabled={!move.later}
          onActivate={() => moveTextBy(1)}
        />
        <TextButton
          icon="bringForward"
          label={t('text.bring_forward')}
          action="bring-forward"
          disabled={!stack.forward}
          onActivate={() => restack(id, 'forward')}
        />
        <TextButton
          icon="sendBack"
          label={t('text.send_back')}
          action="send-back"
          disabled={!stack.back}
          onActivate={() => restack(id, 'back')}
        />
      </div>
    </div>
  );
}
