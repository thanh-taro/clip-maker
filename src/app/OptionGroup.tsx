// MOD-App — an option group (CMP-Inspector "Accessibility": option groups are radio groups): equal
// segments (aspect, frame rate; later Fit/Fill, text style, alignment) or colour swatches with a chip
// (background; later text colour). One radio is in the tab order (the chosen one); the arrows move the
// choice and focus along the group, wrapping, as the ARIA radio group pattern does (MOD-Keys leaves a
// focused radio its arrows, RULE-20). A click always reports the pick, even of the chosen option (the
// action decides whether that changes anything: a frame rate not yet chosen becomes chosen, F-012).
// Implements: CMP-Inspector "Accessibility" (radio groups; swatches named by colour).
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface Option<T> {
  readonly value: T;
  /** Visible label; for a swatch, its accessible name (the dot carries no text). */
  readonly label: string;
  /** `data-value` for tests and styles (the colour name of a swatch). */
  readonly key: string;
  /** A swatch (a colour dot) instead of a text segment. */
  readonly swatch?: boolean;
  /**
   * What the option shows instead of its label (F-010: an alignment icon, a font tile's "Aa" sample and name).
   * With `named`, the label is its accessible name; otherwise the content carries the name itself.
   */
  readonly content?: ComponentChildren;
  readonly named?: boolean;
  /** Changed from its default (F-024: a colour range with a changed value), for styles. */
  readonly changed?: boolean;
  /** A text tile among swatches (colour pop's and duotone's None, duotone's Custom). */
  readonly chip?: boolean;
}

const NEXT: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The class of an option's button per variant. */
const optionClass = (variant: string, o: Option<unknown>): string =>
  variant === 'ranges' || variant === 'pairs'
    ? o.chip
      ? 'tk-ctool__radio tk-ctool__radio--chip'
      : 'tk-ctool__radio'
    : o.swatch
      ? 'tk-swatch'
      : 'tk-option';

export function OptionGroup<T>({
  id,
  label,
  options,
  value,
  onChoose,
  variant,
  labelledBy,
  describedBy,
}: {
  /** Element id prefix (unique per rendered group). */
  readonly id: string;
  /** The field label shown above the control (CMP-Inspector "Frame": each label sits above its control). */
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChoose: (value: T) => void;
  /**
   * `segments`: equal columns; `swatches`: a grid of colour dots, text options as chips; `tiles`: a two-column
   * grid of touch-size tiles (F-010's font picker); `ranges`: the colour tools' range swatches with a None tile;
   * `pairs`: duotone's pair tiles (CMP-Inspector "colour mixer", "colour pop", "duotone").
   */
  readonly variant: 'segments' | 'swatches' | 'tiles' | 'ranges' | 'pairs';
  /**
   * The id of a label shown elsewhere (the Speed section heading, the Edit sheet's row label): the group is
   * named by it and shows no label of its own.
   */
  readonly labelledBy?: string;
  /** The id of a note that describes the group (F-025: COPY-pop.help). */
  readonly describedBy?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const chosen = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent, i: number): void => {
    const step = NEXT[e.key];
    const n = options.length;
    // RULE-20: radio groups get the arrow keys only (Home and End keep their playback meaning).
    const to = step !== undefined ? (i + step + n) % n : null;
    if (to === null || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const next = to;
    const option = options[next]!;
    if (option.value !== value) onChoose(option.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const labelId = labelledBy ?? `${id}-label`;
  return (
    <div class="tk-field">
      {labelledBy ? null : (
        <span class="tk-field__label" id={labelId}>
          {label}
        </span>
      )}
      <div
        ref={group}
        class={`tk-options tk-options--${variant}`}
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        data-count={options.length}
      >
        {options.map((o, i) => {
          const on = i === chosen;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on ? 'true' : 'false'}
              tabIndex={on || (chosen < 0 && i === 0) ? 0 : -1}
              class={optionClass(variant, o)}
              data-value={o.key}
              data-changed={o.changed ? '' : undefined}
              aria-label={o.swatch || o.named ? o.label : undefined}
              title={o.named ? o.label : undefined}
              onClick={() => onChoose(o.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {o.swatch ? <span class="tk-swatch__dot" aria-hidden="true" /> : (o.content ?? o.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
