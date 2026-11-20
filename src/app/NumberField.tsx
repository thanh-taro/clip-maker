// MOD-App — the shared number field (style.md "Number fields", platform-mapping "Number fields accept the
// language's decimal separator", build question 121). A text input (`inputmode="decimal"`), not
// `<input type="number">`: WebKit reads vi-VN "50,5" as 505. It keeps the spinbutton role and the label
// of the slider it is paired with (CMP-Inspector "Accessibility").
// Implements: style.md "Number fields" (typed values use the language's decimal mark, parsed with Intl's
// number parts; a value that can't be read, or an empty one, is rejected: the field shows its value again
// and nothing is edited), CMP-Inspector "Behavior" (fields clamp to the rule's range; one commit on Enter
// or blur is one RULE-13 undo step), F-017.R8 (a rejected or limited value is marked invalid until the next edit
// and announced: COPY-announce.kept, COPY-announce.limited).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatField, language, parseNumber, t } from '../copy';
import { announce } from './announce';

export interface NumberFieldProps {
  /** The value the field shows while it is not being edited. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** ArrowUp / ArrowDown step (the spinbutton keys). */
  readonly step?: number;
  /** Decimals shown (the value is never rounded here; the edit's rule decides its precision). */
  readonly fractionDigits?: number;
  /** Always show `fractionDigits` decimals (the speed field reads `2.00`, CMP-Inspector "clip Speed"). */
  readonly fixedDigits?: boolean;
  /** Show a plus sign on positive values (F-007's bipolar adjustments read "+12"). */
  readonly signed?: boolean; /**
   * Called once per commit with the typed value, clamped to min–max, only when it differs from `value`.
   * Returns the value now in effect (the rule may round it), which the field then shows.
   */
  readonly onCommit: (value: number) => number;
  readonly labelledBy: string;
  /** A note that describes the field (CMP-Inspector "clip Speed": a fade a cross-fade replaces). */
  readonly describedBy?: string | undefined;
  readonly class?: string;
  readonly control?: string;
  /** Unavailable (F-008: Intensity while None is chosen). */
  readonly disabled?: boolean;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function NumberField(props: NumberFieldProps) {
  const { value, min, max, step = 1, fractionDigits = 0 } = props;
  const lang = language.value;
  const ref = useRef<HTMLInputElement>(null);
  /** The user has typed since the last commit or restore; the shown value is then left alone. */
  const editing = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  /** F-017.R8: the last commit was rejected or limited (cleared by the next edit). */
  const [invalid, setInvalid] = useState(false);
  /** The field's text for value `v`. */
  const textOf = (v: number): string => {
    const signed = latest.current.signed === true;
    const text = formatField(
      signed ? Math.abs(v) : v,
      language.peek(),
      latest.current.fractionDigits ?? 0,
      latest.current.fixedDigits === true,
    );
    // A signed field reads "+12" and "−8" (U+2212, board CMP-Inspector "clip Adjust"); both read back.
    return !signed || v === 0 ? text : v < 0 ? `−${text}` : `+${text}`;
  };
  const show = (v: number): void => {
    if (ref.current) ref.current.value = textOf(v);
  };

  // Uncontrolled: a re-render while the user types never overwrites the text; a new value or language
  // from elsewhere (the slider, undo, a language switch) is shown when the field is not being edited.
  useLayoutEffect(() => {
    if (!editing.current) show(value);
  }, [value, lang, fractionDigits, props.fixedDigits, props.signed]);

  const commitValue = (typed: number, typedByHand = false): void => {
    editing.current = false;
    const p = latest.current;
    const next = clamp(typed, p.min, p.max);
    const now = next === p.value ? p.value : p.onCommit(next);
    show(now);
    // F-017.R8: a typed value outside the range is limited, never silently.
    if (typedByHand && next !== typed) {
      setInvalid(true);
      announce(t('announce.limited', { value: textOf(now) }));
    }
  };

  const commit = (): void => {
    if (!editing.current || !ref.current) return;
    const typed = parseNumber(ref.current.value, language.peek());
    if (typed === null) {
      // Empty or unreadable: no edit, the value comes back (F-017.R8: marked invalid and announced).
      editing.current = false;
      show(latest.current.value);
      setInvalid(true);
      announce(t('announce.kept', { value: textOf(latest.current.value) }));
      return;
    }
    commitValue(typed, true);
  };

  return (
    <input
      ref={ref}
      type="text"
      // iOS's decimal keypad has no minus key: a field that takes negative values (F-007's bipolar adjustments,
      // F-006's Offset X and Y) gets the text keyboard.
      inputMode={props.signed === true || min < 0 ? 'text' : 'decimal'}
      disabled={props.disabled === true}
      role="spinbutton"
      autoComplete="off"
      spellcheck={false}
      class={props.class}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-invalid={invalid ? 'true' : undefined}
      data-control={props.control}
      onInput={() => {
        editing.current = true;
        if (invalid) setInvalid(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // The spinbutton keys step from the shown value; each press is one edit.
          e.preventDefault();
          const p = latest.current;
          const typed = editing.current && ref.current ? parseNumber(ref.current.value, language.peek()) : null;
          const base = typed ?? p.value;
          commitValue(base + (e.key === 'ArrowUp' ? step : -step));
        }
      }}
      onBlur={commit}
    />
  );
}
