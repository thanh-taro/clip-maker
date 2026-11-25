// MOD-App — CMP-ColourPicker for duotone's Custom colours (F-027.R3): a dialog titled COPY-picker.title with
// the before/after swatch pair (the colour when it opened, and now, each with its hex), the hex field
// (COPY-picker.hex; invalid: COPY-picker.hex_invalid under it, the colour keeps its last valid value), the
// ten RULE-11 presets (COPY-picker.presets, a radio group named by colour), the Hue (hue wheel on its track),
// Saturation and Lightness sliders with number fields, and Done (COPY-picker.done). Wide: a popover under its
// colour button; a click outside closes it. Narrow: it opens in place of the Adjust sheet's body, Done at the
// top as the way back, at touch size, label above control.
// Implements: CMP-ColourPicker "Behavior" (changes apply live; each slider movement, preset tap or confirmed
// hex entry is one undo step; closing changes nothing; hex `#RGB` or `#RRGGBB`, with or without `#`, on Enter
// or leaving the field, shown in upper case; Esc or Done closes and returns focus to the colour button) and
// "Accessibility" (a dialog named COPY-picker.title, focus starts on the hue slider; presets are a radio
// group with colour names; sliders have value text and paired number fields), F-027.AC4.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import { PALETTE, PALETTE_HEX, type PaletteName } from '../core';
import {
  HUE_WHEEL_TRACK,
  beginColourDrag,
  closePicker,
  duotoneHex,
  hexHsl,
  hslHex,
  hueRange,
  lightnessTrack,
  parseHex,
  pickerOpen,
  saturationTrack,
  setColourOnce,
  toolsTarget,
  type Hsl,
  type PickerFor,
} from './colour-tools';
import { announce } from './announce';
import { OptionGroup } from './OptionGroup';
import { ToolSlider } from './ToolSlider';

type Part = keyof Hsl;

const LIMITS: Readonly<Record<Part, number>> = { h: 359, s: 100, l: 100 };

export function ColourPicker({
  clipId,
  which,
  touch,
}: {
  readonly clipId: string;
  readonly which: PickerFor;
  readonly touch: boolean;
}) {
  const hex = duotoneHex(toolsTarget.value?.tools, which);
  const id = `tk-picker-${touch ? 'sheet' : 'pop'}-${which}`;
  const dialog = useRef<HTMLDivElement>(null);
  const [before] = useState(hex);
  // The sliders' own values: a hue survives a grey colour, and whole steps survive the trip through hex.
  const [hsl, setHsl] = useState<Hsl>(() => hexHsl(hex));
  const hslRef = useRef(hsl);
  hslRef.current = hsl;
  useEffect(() => {
    if (hslHex(hslRef.current) !== hex) setHsl(hexHsl(hex));
  }, [hex]);
  // Focus starts on the hue slider.
  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input[type="range"]')?.focus();
  }, []);
  // Esc closes the picker only (the sheet stays open: this runs first, in the capture phase, and the sheet
  // ignores a handled Esc), and focus returns to its colour button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || !dialog.current?.contains(document.activeElement)) return;
      e.preventDefault();
      closePicker(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  // Wide: a click outside the popover (and its colour button) closes it.
  useEffect(() => {
    if (touch) return undefined;
    const outside = (e: PointerEvent): void => {
      const n = e.target as Element | null;
      if (!n || dialog.current?.contains(n) || n.closest?.(`[data-action="colour-${which}"]`)) return;
      closePicker(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [touch, which]);

  const titleId = `${id}-title`;
  const Title = touch ? 'h3' : 'h5';
  const hexId = `${id}-hex`;
  const errorId = `${id}-hex-error`;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commitHex = (): void => {
    if (draft === null) return;
    const parsed = parseHex(draft);
    setDraft(null);
    if (!parsed) {
      setInvalid(true);
      announce(t('picker.hex_invalid'));
      return;
    }
    setInvalid(false);
    if (parsed !== hex) setColourOnce(clipId, which, parsed);
  };

  const row = (part: Part, label: string, track: string, text: (v: number) => string) => {
    const at = (v: number): Hsl => ({ ...hslRef.current, [part]: Math.min(LIMITS[part], Math.max(0, Math.round(v))) });
    return (
      <ToolSlider
        id={`${id}-${part}`}
        control={`picker-${part}`}
        label={label}
        value={hsl[part]}
        min={0}
        max={LIMITS[part]}
        bipolar={false}
        valueText={text}
        changed={false}
        track={track}
        stacked={touch}
        gestureKey={`${clipId}:${which}`}
        begin={() => {
          const drag = beginColourDrag(clipId, which);
          return {
            set(v) {
              const next = at(v);
              setHsl(next);
              hslRef.current = next;
              drag.set(hslHex(next));
            },
            end: () => drag.end(),
            get active() {
              return drag.active;
            },
          };
        }}
        step={(v) => {
          const next = at(v);
          setHsl(next);
          hslRef.current = next;
          setColourOnce(clipId, which, hslHex(next));
        }}
        shown={() => undefined}
        commit={(v) => {
          const next = at(v);
          setHsl(next);
          hslRef.current = next;
          setColourOnce(clipId, which, hslHex(next));
          return next[part];
        }}
      />
    );
  };

  const preset = (Object.keys(PALETTE_HEX) as PaletteName[]).find((n) => PALETTE_HEX[n] === hex) ?? null;
  const done = (
    <button type="button" class="tk-button tk-picker__done" data-action="picker-done" onClick={() => closePicker(true)}>
      {t('picker.done')}
    </button>
  );
  return (
    <div
      ref={dialog}
      class={touch ? 'tk-picker tk-picker--touch' : 'tk-picker'}
      role="dialog"
      aria-labelledby={titleId}
      data-section="colour-picker"
    >
      <div class="tk-picker__head">
        {/* In the sheet it takes the body's place (below the sheet's title level); wide, it sits in a group. */}
        <Title class="tk-picker__title" id={titleId}>
          {t('picker.title')}
        </Title>
        {touch ? done : null}
      </div>
      <div class="tk-picker__fixed">
        <div class="tk-picker__compare">
          {[before, hex].map((c, i) => (
            <span key={i} class="tk-picker__sample">
              <span class="tk-picker__swatch" aria-hidden="true" style={{ '--ctool-swatch': c }} />
              <span class="tk-picker__sample-hex">{c}</span>
            </span>
          ))}
        </div>
        <div class="tk-picker__hex">
          <label class="tk-field__label" for={hexId}>
            {t('picker.hex')}
          </label>
          <input
            id={hexId}
            class="tk-picker__hex-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellcheck={false}
            maxLength={7}
            value={draft ?? hex}
            aria-invalid={invalid ? 'true' : undefined}
            aria-describedby={invalid ? errorId : undefined}
            data-control="picker-hex"
            onInput={(e) => {
              setDraft(e.currentTarget.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitHex();
              }
            }}
            onBlur={commitHex}
          />
          {invalid ? (
            <p class="tk-picker__error" id={errorId}>
              {t('picker.hex_invalid')}
            </p>
          ) : null}
        </div>
      </div>
      <div class="tk-picker__scroll">
        <div class="tk-picker__presets">
          <OptionGroup<PaletteName | null>
            id={`${id}-presets`}
            label={t('picker.presets')}
            variant="swatches"
            value={preset}
            onChoose={(n) => {
              if (n && PALETTE_HEX[n] !== hex) setColourOnce(clipId, which, PALETTE_HEX[n]);
            }}
            options={PALETTE.map((n) => ({ value: n, key: n, label: t(`colour.${n}`), swatch: true }))}
          />
        </div>
        {row('h', t('picker.hue'), HUE_WHEEL_TRACK, (v) =>
          t('colour_tools.hue_value', { degrees: v, range: t(`range.${hueRange(v)}`) }),
        )}
        {row('s', t('picker.saturation'), saturationTrack(hsl), String)}
        {row('l', t('picker.lightness'), lightnessTrack(hsl), String)}
      </div>
      {touch ? null : <div class="tk-picker__foot">{done}</div>}
    </div>
  );
}

/** The narrow Adjust sheet's body while the picker is open (CMP-Inspector "narrow / Adjust sheet"). */
export function SheetPicker() {
  const open = pickerOpen.value;
  const target = toolsTarget.value;
  if (!open || target?.id !== open.clipId) return null;
  return <ColourPicker clipId={open.clipId} which={open.which} touch />;
}
