// MOD-App — CMP-Inspector's Duration row for a photo clip (specs/30-experience/components/CMP-Inspector.md
// "photo clip"; board CMP-Inspector "photo clip"): the heading Duration (COPY-photo.duration), then a row with
// the label Duration, a slider (0.1–60 s in 0.1 s steps, accent fill from the start) and its paired number
// field (seconds, one decimal, then COPY-fades.unit), in place of a video's Speed, between Position and
// Fades. On narrow layouts the Edit sheet shows the same row at touch size with its label on the left
// (CMP-Timeline "narrow / sheet open"), as the sheet's Exact and Fade rows.
// Implements: F-004.R8 (a photo's duration in the inspector and the Edit sheet), CMP-Inspector "Behavior"
// (slider drags update the preview live and are one undo step per movement; fields accept typed values and
// clamp to the rule's range; RULE-03 stops with COPY-notice.length_limited) and "Accessibility" (the slider
// and its field share the label).
import { t } from '../copy';
import { NumberField } from './NumberField';
import { useSliderGesture } from './slider-gesture';
import {
  beginDurationDrag,
  DURATION_MAX_TENTHS,
  DURATION_MIN_TENTHS,
  durationTarget,
  setDurationOnce,
} from './duration';
import { secondsLabel } from './fades';

export function DurationSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = durationTarget.value;
  // One slider movement is one step, measured from where it began; another selection mid-drag ends it.
  const gesture = useSliderGesture({
    key: target?.id ?? null,
    value: target?.tenths ?? 0,
    begin: () => beginDurationDrag(target!.id, () => undefined),
    step: (v) => setDurationOnce(target!.id, v),
    shown: () => durationTarget.peek()?.tenths,
  });
  if (!target) return null;
  const headId = `${id}-title`;
  const labelId = `${id}-label`;
  return (
    <section
      class={touch ? 'tk-fades tk-fades--touch tk-duration' : 'tk-fades tk-duration'}
      data-section="duration"
      aria-labelledby={touch ? labelId : headId}
    >
      {touch ? null : (
        <h3 class="tk-fades__head" id={headId}>
          {t('photo.duration')}
        </h3>
      )}
      <div class={touch ? 'tk-fades__rows tk-fades__rows--touch' : 'tk-fades__rows'}>
        {/* The number reads in the text colour: a photo always has a duration (no default to mute it at). */}
        <div class="tk-fades__row" data-changed="">
          <span class="tk-fades__label" id={labelId}>
            {t('photo.duration')}
          </span>
          <input
            type="range"
            class="tk-fades__slider"
            min={DURATION_MIN_TENTHS}
            max={DURATION_MAX_TENTHS}
            step={1}
            value={target.tenths}
            aria-labelledby={labelId}
            aria-valuetext={secondsLabel(target.tenths)}
            data-control="duration-slider"
            {...gesture}
          />
          <span class="tk-fades__field">
            <NumberField
              class={touch ? 'tk-fades__number tk-fades__number--touch' : 'tk-fades__number'}
              control="duration-field"
              min={DURATION_MIN_TENTHS / 10}
              max={DURATION_MAX_TENTHS / 10}
              step={0.1}
              fractionDigits={1}
              fixedDigits
              value={target.tenths / 10}
              labelledBy={labelId}
              onCommit={(v) => setDurationOnce(target.id, Math.round(v * 10)) / 10}
            />
            <span class="tk-fades__unit" aria-hidden="true">
              {t('fades.unit')}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
