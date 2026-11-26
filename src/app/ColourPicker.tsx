// MOD-App — CMP-ColourPicker for duotone's Custom colours (F-027.R3): a dialog titled COPY-picker.title with the
// subtitle COPY-picker.editing (the colour it edits), one row with the split before/after swatch (the colour
// when it opened, COPY-picker.before; now, COPY-picker.now) and the hex field (COPY-picker.hex; invalid:
// the typed text kept, COPY-picker.hex_invalid under it, the colour keeps its last valid value), the ten
// RULE-11 presets (COPY-picker.presets, a radio group named by colour), the Hue (hue wheel on its track),
// Saturation and Lightness sliders with number fields, and Done (COPY-picker.done). Wide: a popover under its
// colour button, the presets in two rows of five; a click outside closes it. Narrow: it opens in place of the
// Adjust sheet's body (the sheet up to 60 % of the height, its footer hidden), Done at the top, touch-size
// rows with labels to the left, so it fits at 320 × 640 without scrolling inside the sheet.
// Implements: CMP-ColourPicker "Anatomy", "Variants & states", "Behavior" (changes apply live; each slider
// movement, preset tap or confirmed hex entry is one undo step; closing changes nothing; hex `#RGB` or
// `#RRGGBB`, with or without `#`, on Enter or leaving the field, shown in upper case; Esc or Done closes and
// returns focus to the colour button) and "Accessibility" (a dialog named COPY-picker.title, focus starts on
// the hue slider; presets are a radio group with colour names; sliders have value text and paired number
// fields), F-027.AC4. F-028: it also edits a colour replacement's From and To; for From (RULE-25) a Saturation or
// Lightness drag stops at the last value that is not grey and a typed or preset grey is refused, with
// COPY-notice.replace_grey under the field (the colour reverts to its last value); a faint From is accepted with
// COPY-notice.replace_faint under the field, once per entry (CMP-ColourPicker "refused (colour replace From)").
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import { fromStatus, PALETTE, PALETTE_HEX, type Notice, type PaletteName } from '../core';
import { announce } from './announce';
import {
  HUE_WHEEL_TRACK,
  beginColourDrag,
  closePicker,
  hexHsl,
  hslHex,
  hueText,
  isGreyFrom,
  lightnessTrack,
  parseHex,
  pickerHex,
  pickerLabel,
  pickerOpen,
  refusesGrey,
  saturationTrack,
  setColourOnce,
  toolsTarget,
  type Hsl,
  type PickerFor,
} from './colour-tools';
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
  const hex = pickerHex(toolsTarget.value?.tools, which);
  const id = `tk-picker-${touch ? 'sheet' : 'pop'}-${which}`;
  /** RULE-25: the From colour's refusal or faint hint under the field (null: none). */
  const [fromNote, setFromNote] = useState<'notice.replace_grey' | 'notice.replace_faint' | null>(null);
  const faintShown = useRef(false);
  const noteFrom = (notices: readonly Notice[]): void => {
    if (notices.includes('notice.replace_grey')) {
      setFromNote('notice.replace_grey');
      announce(t('notice.replace_grey'));
    } else if (notices.includes('notice.replace_faint')) {
      // Once per entry: announced when the colour becomes faint, and kept under the field while it stays faint.
      if (!faintShown.current) announce(t('notice.replace_faint'));
      faintShown.current = true;
      setFromNote('notice.replace_faint');
    } else {
      faintShown.current = false;
      setFromNote(null);
    }
  };
  /** A colour entered or picked here: applied, or refused (grey From). */
  const setOnce = (next: string): void => noteFrom(setColourOnce(clipId, which, next));
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
  const hexId = `${id}-hex`;
  const errorId = `${id}-hex-error`;
  /** The typed text while it differs from the colour (kept when invalid, CMP-ColourPicker "hex invalid"). */
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commitHex = (): void => {
    if (draft === null) return;
    const parsed = parseHex(draft);
    if (!parsed) {
      setInvalid(true);
      announce(t('picker.hex_invalid'));
      return;
    }
    setDraft(null);
    setInvalid(false);
    if (parsed !== hex) setOnce(parsed);
  };

  /** The sliders' colour with one part set; for a From colour a grey result is refused and the last one kept. */
  const apply = (part: Part, v: number): Hsl => {
    const next = { ...hslRef.current, [part]: Math.min(LIMITS[part], Math.max(0, Math.round(v))) };
    if (isGreyFrom(which, hslHex(next))) {
      // RULE-25: a Saturation or Lightness drag stops at the last value that is not grey.
      if (fromNote !== 'notice.replace_grey') noteFrom(['notice.replace_grey']);
      return hslRef.current;
    }
    setHsl(next);
    hslRef.current = next;
    return next;
  };
  const faintNote = (h: string): void => {
    if (refusesGrey(which) && fromStatus(h) === 'faint') noteFrom(['notice.replace_faint']);
    else if (fromNote === 'notice.replace_grey') setFromNote(null);
  };
  const row = (part: Part, label: string, track: string, text: (v: number) => string) => (
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
      gestureKey={`${clipId}:${which}`}
      begin={() => {
        const drag = beginColourDrag(clipId, which);
        return {
          set: (v) => drag.set(hslHex(apply(part, v))),
          end: () => {
            drag.end();
            faintNote(hslHex(hslRef.current));
          },
          get active() {
            return drag.active;
          },
        };
      }}
      step={(v) => setOnce(hslHex(apply(part, v)))}
      shown={() => hslRef.current[part]}
      commit={(v) => {
        const next = apply(part, v);
        setOnce(hslHex(next));
        return next[part];
      }}
    />
  );

  const preset = (Object.keys(PALETTE_HEX) as PaletteName[]).find((n) => PALETTE_HEX[n] === hex) ?? null;
  const done = (
    <button type="button" class="tk-button tk-picker__done" data-action="picker-done" onClick={() => closePicker(true)}>
      {t('picker.done')}
    </button>
  );
  // In the sheet it takes the body's place (below the sheet's title level); wide, it sits inside a group.
  const Title = touch ? 'h3' : 'h5';
  const presetsId = `${id}-presets-label`;
  return (
    <div
      ref={dialog}
      class={touch ? 'tk-picker tk-picker--touch' : 'tk-picker'}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={`${id}-for`}
      data-section="colour-picker"
    >
      <div class="tk-picker__head">
        <div class="tk-picker__titles">
          <Title class="tk-picker__title" id={titleId}>
            {t('picker.title')}
          </Title>
          <p class="tk-picker__for" id={`${id}-for`}>
            {t('picker.editing', { name: pickerLabel(which) })}
          </p>
        </div>
        {touch ? done : null}
      </div>
      <div class="tk-picker__fixed">
        <div class="tk-picker__compare">
          <span
            class="tk-picker__swatch"
            aria-hidden="true"
            style={{ '--ctool-a': before, '--ctool-b': hex }}
            data-before={before}
            data-now={hex}
          />
          <span class="tk-picker__compare-labels">
            <span>{t('picker.before')}</span>
            <span>{t('picker.now')}</span>
          </span>
        </div>
        <div class="tk-picker__hex">
          <label class="tk-picker__label" for={hexId}>
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
            aria-invalid={invalid || fromNote === 'notice.replace_grey' ? 'true' : undefined}
            aria-describedby={invalid ? errorId : fromNote ? `${id}-from-note` : undefined}
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
        </div>
        {invalid ? (
          <p class="tk-picker__error" id={errorId}>
            {t('picker.hex_invalid')}
          </p>
        ) : fromNote ? (
          <p
            class={fromNote === 'notice.replace_grey' ? 'tk-picker__error' : 'tk-picker__hint'}
            id={`${id}-from-note`}
            data-notice={fromNote.slice('notice.'.length)}
          >
            {t(fromNote)}
          </p>
        ) : null}
      </div>
      <div class="tk-picker__presets">
        <span class="tk-picker__label" id={presetsId}>
          {t('picker.presets')}
        </span>
        <OptionGroup<PaletteName | null>
          id={`${id}-presets`}
          label={t('picker.presets')}
          labelledBy={presetsId}
          variant="swatches"
          value={preset}
          onChoose={(n) => {
            if (n && PALETTE_HEX[n] !== hex) setOnce(PALETTE_HEX[n]);
          }}
          options={PALETTE.map((n) => ({ value: n, key: n, label: t(`colour.${n}`), swatch: true }))}
        />
      </div>
      {row('h', t('picker.hue'), HUE_WHEEL_TRACK, hueText)}
      {row('s', t('picker.saturation'), saturationTrack(hsl), String)}
      {row('l', t('picker.lightness'), lightnessTrack(hsl), String)}
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
