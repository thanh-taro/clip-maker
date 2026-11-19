// MOD-App — CMP-Inspector's Fades (specs/30-experience/components/CMP-Inspector.md "clip Speed", "photo
// clip", "audio clip"; board CMP-Inspector "clip Speed" and "audio clip"): Fade in and Fade out (COPY-fades.in,
// COPY-fades.out) as sliders with their paired number fields (seconds, one decimal, then `s`), in 0.1 s
// steps from 0 to 3 s for a clip and 0 to 5 s for an audio clip (RULE-10); for a clip, the section heading
// Fades (COPY-inspector.fades) and the Quick fade in / Quick fade out toggles (COPY-fades.quick_in,
// COPY-fades.quick_out). On narrow layouts the Edit sheet's Fades row (CMP-Timeline "narrow / sheet open")
// is two equal toggles, Fade in and Fade out, each with its length in mono, then the same slider rows at
// touch size (as the sheet's Exact row, build question 128).
// Implements: F-009.R1 (fade in and out on a clip), F-009.R4 (on an audio clip), F-009.R5 (0.1 s steps,
// clamped to the rule's range), CMP-Inspector "Behavior" (slider drags update the preview live and are one
// undo step per movement; fields accept typed values and clamp; quick fade sets the rule's quick value) and
// "Accessibility" (every slider has a paired field with the same label; toggles expose a pressed state),
// CMP-Inspector "clip Speed" (a fade a cross-fade replaces is dimmed with COPY-fades.replaced; RULE-10).
import { t } from '../copy';
import { NumberField } from './NumberField';
import { useSliderGesture } from './slider-gesture';
import { beginFadeDrag, fadeTarget, secondsLabel, setFadeOnce, toggleQuickFade, type FadeEdge } from './fades';

const LABEL = { in: 'fades.in', out: 'fades.out' } as const;
const QUICK = { in: 'fades.quick_in', out: 'fades.quick_out' } as const;

/** One Fade in or Fade out row: label, slider and its field (tenths of a second on the slider). */
function FadeRow({ id, edge, touch }: { readonly id: string; readonly edge: FadeEdge; readonly touch: boolean }) {
  const target = fadeTarget.value;
  const value = target ? (edge === 'in' ? target.fadeIn : target.fadeOut) : 0;
  // One slider movement is one step, measured from where it began; another selection mid-drag ends it.
  const gesture = useSliderGesture({
    key: target ? `${target.id}:${edge}` : null,
    value,
    begin: () => beginFadeDrag(target!.id, edge, () => undefined),
    step: (v) => setFadeOnce(target!.id, edge, v),
    shown: () => {
      const now = fadeTarget.peek();
      return now ? (edge === 'in' ? now.fadeIn : now.fadeOut) : undefined;
    },
  });
  if (!target) return null;
  const labelId = `${id}-${edge}-label`;
  // RULE-10: a cross-fade at this end replaces the fade; the row is dimmed with a note, and stays settable
  // (the fade applies again when the cross-fade goes). CMP-Inspector "clip Speed", build question 157.
  const replaced = edge === 'in' ? target.replacedIn : target.replacedOut;
  const noteId = replaced ? `${id}-${edge}-replaced` : undefined;
  const row = (
    <div
      class="tk-fades__row"
      data-changed={value > 0 ? '' : undefined}
      data-replaced={replaced ? '' : undefined}
      data-edge={edge}
    >
      <span class="tk-fades__label" id={labelId}>
        {t(LABEL[edge])}
      </span>
      <input
        type="range"
        class="tk-fades__slider"
        min={0}
        max={target.maxTenths}
        step={1}
        value={value}
        aria-labelledby={labelId}
        aria-valuetext={secondsLabel(value)}
        aria-describedby={noteId}
        data-control={`fade-${edge}-slider`}
        {...gesture}
      />
      <span class="tk-fades__field">
        <NumberField
          class={touch ? 'tk-fades__number tk-fades__number--touch' : 'tk-fades__number'}
          control={`fade-${edge}-field`}
          min={0}
          max={target.maxTenths / 10}
          step={0.1}
          fractionDigits={1}
          fixedDigits
          value={value / 10}
          labelledBy={labelId}
          describedBy={noteId}
          onCommit={(v) => setFadeOnce(target.id, edge, Math.round(v * 10)) / 10}
        />
        <span class="tk-fades__unit" aria-hidden="true">
          {t('fades.unit')}
        </span>
      </span>
    </div>
  );
  if (!noteId) return row;
  return (
    <>
      {row}
      <p class="tk-fades__note" id={noteId} data-edge={edge}>
        {t('fades.replaced')}
      </p>
    </>
  );
}

/** Fade in and Fade out rows for the selection (a clip or an audio clip); used by the audio clip's sound section. */
export function FadeRows({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  if (!fadeTarget.value) return null;
  return (
    <div class={touch ? 'tk-fades__rows tk-fades__rows--touch' : 'tk-fades__rows'} data-section="fade-rows">
      <FadeRow id={id} edge="in" touch={touch} />
      <FadeRow id={id} edge="out" touch={touch} />
    </div>
  );
}

/**
 * A clip's Fades section (the Edit tab after Speed or Position; the phone Edit sheet's Fades row). Wide: the
 * heading, the two rows and the quick toggles. Touch: the row label with the two toggles (each with its
 * length), then the rows.
 */
export function FadesSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = fadeTarget.value;
  if (!target || target.kind !== 'clip') return null;
  const headId = `${id}-title`;
  const toggle = (edge: FadeEdge) => {
    const tenths = edge === 'in' ? target.fadeIn : target.fadeOut;
    return (
      <button
        key={edge}
        type="button"
        class="tk-button tk-fades__toggle"
        aria-pressed={tenths > 0 ? 'true' : 'false'}
        data-action={`quick-fade-${edge}`}
        onClick={() => toggleQuickFade(target.id, edge)}
      >
        {touch ? (
          <>
            <span class="tk-fades__toggle-label">{t(LABEL[edge])}</span>
            <span class="tk-fades__toggle-length">{secondsLabel(tenths)}</span>
          </>
        ) : (
          t(QUICK[edge])
        )}
      </button>
    );
  };
  return (
    <section class={touch ? 'tk-fades tk-fades--touch' : 'tk-fades'} data-section="fades" aria-labelledby={headId}>
      {touch ? (
        <div class="tk-fades__line">
          <h3 class="tk-fades__line-label" id={headId}>
            {t('inspector.fades')}
          </h3>
          <div class="tk-fades__toggles">{(['in', 'out'] as const).map(toggle)}</div>
        </div>
      ) : (
        <h3 class="tk-fades__head" id={headId}>
          {t('inspector.fades')}
        </h3>
      )}
      <FadeRows id={id} touch={touch} />
      {touch ? null : <div class="tk-fades__toggles">{(['in', 'out'] as const).map(toggle)}</div>}
    </section>
  );
}
