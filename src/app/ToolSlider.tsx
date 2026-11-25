// MOD-App — one slider row of the colour tools and the colour picker (CMP-Inspector "clip Adjust": label,
// slider, number field with the same name, per-row Reset shown only when changed; the classes and look of
// the Adjust rows, ./styles/adjust.css). A slider may draw the colours it reaches on its track (hue wheel,
// mixer Hue, picker tracks) instead of the accent fill.
// Implements: NFR-06 (sliders have names and value text; every slider has a paired number field), F-024.R5,
// F-025.R5, F-026.R5 (keyboard and number field), RULE-13 via ./slider-gesture.ts (one step per movement).
import { useRef } from 'preact/hooks';
import { t } from '../copy';
import { Icon } from './icons';
import { NumberField } from './NumberField';
import { useSliderGesture, type SliderDrag } from './slider-gesture';

export interface ToolSliderProps {
  /** Unique element id stem. */
  readonly id: string;
  /** `data-control` stem (`-slider`, `-field`). */
  readonly control: string;
  /** The visible label. */
  readonly label: string;
  /** The accessible name of the slider and its field, when it says more than the label ("Red Hue"). */
  readonly name?: string | undefined;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly bipolar: boolean;
  readonly valueText: (value: number) => string;
  /** Changed from its default: the knob's accent ring, the field in the text colour, Reset shown. */
  readonly changed: boolean;
  readonly disabled?: boolean | undefined;
  /** A CSS gradient drawn as the track (the colours the slider reaches). */
  readonly track?: string | undefined;
  /** What the slider acts on: when it changes mid-drag, the movement ends. */
  readonly gestureKey: unknown;
  readonly begin: () => SliderDrag;
  readonly step: (value: number) => void;
  readonly shown: () => number | undefined;
  readonly commit: (value: number) => number;
  /** Per-row Reset (absent: the row has none). */
  readonly reset?: (() => void) | undefined;
  /** Label above the control (CMP-ColourPicker narrow). */
  readonly stacked?: boolean | undefined;
}

export function ToolSlider(props: ToolSliderProps) {
  const { id, control, value, min, max, bipolar, changed, disabled = false, track, reset } = props;
  const labelId = `${id}-label`;
  const nameId = props.name ? `${id}-name` : labelId;
  const slider = useRef<HTMLInputElement>(null);
  const gesture = useSliderGesture({
    key: props.gestureKey,
    value,
    begin: props.begin,
    step: props.step,
    shown: props.shown,
  });
  const at = (value - min) / (max - min);
  const from = bipolar ? 0.5 : 0;
  const style: Record<string, string> = track
    ? { '--ctool-track': track }
    : { '--adjust-lo': String(Math.min(from, at)), '--adjust-hi': String(Math.max(from, at)) };
  return (
    <div
      class={props.stacked ? 'tk-adjust__row tk-ctool__row--stacked' : 'tk-adjust__row'}
      role="group"
      aria-labelledby={nameId}
      data-control={control}
      data-changed={changed ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      <span class="tk-adjust__label" id={labelId} aria-hidden={props.name ? 'true' : undefined}>
        {props.label}
      </span>
      {props.name ? (
        <span class="tk-visually-hidden" id={nameId}>
          {props.name}
        </span>
      ) : null}
      <input
        ref={slider}
        type="range"
        class="tk-adjust__slider"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-labelledby={nameId}
        aria-valuetext={props.valueText(value)}
        data-control={`${control}-slider`}
        data-bipolar={bipolar && !track ? '' : undefined}
        data-track={track ? '' : undefined}
        style={style}
        {...gesture}
      />
      <NumberField
        class="tk-adjust__number"
        control={`${control}-field`}
        min={min}
        max={max}
        value={value}
        signed={bipolar}
        labelledBy={nameId}
        disabled={disabled}
        onCommit={props.commit}
      />
      {reset && changed ? (
        <button
          type="button"
          class="tk-icon-button tk-adjust__reset"
          aria-label={t('action.reset')}
          aria-describedby={nameId}
          title={t('action.reset')}
          data-action="reset-value"
          onClick={() => {
            // The Reset goes away with the change: focus moves to the row's slider first, not to the page.
            slider.current?.focus();
            reset();
          }}
        >
          <Icon name="reset" size={12} />
        </button>
      ) : reset ? (
        <span class="tk-adjust__reset-space" aria-hidden="true" />
      ) : null}
    </div>
  );
}
