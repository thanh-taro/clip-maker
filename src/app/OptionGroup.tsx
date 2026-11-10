// MOD-App — an option group (CMP-Inspector "Accessibility": option groups are radio groups): equal
// segments (aspect, frame rate; later Fit/Fill, text style, alignment) or colour swatches with a chip
// (background; later text colour). One radio is in the tab order (the chosen one); the arrows move the
// choice and focus along the group, wrapping, as the ARIA radio group pattern does (MOD-Keys leaves a
// focused radio its arrows, RULE-20). A click always reports the pick, even of the chosen option (the
// action decides whether that changes anything: a frame rate not yet chosen becomes chosen, F-012).
// Implements: CMP-Inspector "Accessibility" (radio groups; swatches named by colour).
import { useRef } from 'preact/hooks';

export interface Option<T> {
  readonly value: T;
  /** Visible label; for a swatch, its accessible name (the dot carries no text). */
  readonly label: string;
  /** `data-value` for tests and styles (the colour name of a swatch). */
  readonly key: string;
  /** A swatch (a colour dot) instead of a text segment. */
  readonly swatch?: boolean;
}

const NEXT: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function OptionGroup<T>({
  id,
  label,
  options,
  value,
  onChoose,
  variant,
}: {
  /** Element id prefix (unique per rendered group). */
  readonly id: string;
  /** The field label shown above the control (CMP-Inspector "Frame": each label sits above its control). */
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChoose: (value: T) => void;
  /** `segments`: equal columns; `swatches`: a grid of colour dots, text options as chips. */
  readonly variant: 'segments' | 'swatches';
}) {
  const group = useRef<HTMLDivElement>(null);
  const chosen = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent, i: number): void => {
    const step = NEXT[e.key];
    if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const n = options.length;
    const next = (i + step + n) % n;
    const option = options[next]!;
    if (option.value !== value) onChoose(option.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const labelId = `${id}-label`;
  return (
    <div class="tk-field">
      <span class="tk-field__label" id={labelId}>
        {label}
      </span>
      <div
        ref={group}
        class={`tk-options tk-options--${variant}`}
        role="radiogroup"
        aria-labelledby={labelId}
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
              class={o.swatch ? 'tk-swatch' : 'tk-option'}
              data-value={o.key}
              aria-label={o.swatch ? o.label : undefined}
              onClick={() => onChoose(o.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {o.swatch ? <span class="tk-swatch__dot" aria-hidden="true" /> : o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
