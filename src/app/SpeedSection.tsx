// MOD-App — CMP-Inspector's Speed section (specs/30-experience/components/CMP-Inspector.md "clip Speed";
// board CMP-Inspector "clip Speed"): the heading Speed (COPY-inspector.speed) with the resulting length
// (COPY-speed.length) on its right; six equal quick-speed segments (RULE-06: 0.25×, 0.5×, 1×, 1.5×, 2×,
// 4×; vi-VN with a decimal comma); the Exact (COPY-speed.exact) slider (0.25×–4× in 0.05× steps, accent
// fill from the start) with its paired number field (two decimals, then ×). In the docked inspector's
// Edit tab; on narrow layouts the Edit sheet shows the same controls at touch size as a Speed row with
// its label on the left (CMP-Timeline "narrow / sheet open"), then the Exact row.
// Implements: F-005.R1 (quick choices and a fine control), F-005 UX notes (COPY-inspector.speed),
// CMP-Inspector "Behavior" (slider drags update the preview live and are one undo step; fields accept
// typed values and clamp to the rule's range; quick speed sets the rule's quick values; RULE-03 stops
// with COPY-notice.length_limited) and "Accessibility" (the speed choices are a radio group; the slider
// and its field share the label Exact).
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { RULE_06 } from '../core';
import { NumberField } from './NumberField';
import { OptionGroup, type Option } from './OptionGroup';
import { beginSpeedDrag, QUICK_SPEEDS, setSpeedOnce, speedLabel, speedTarget, type SpeedDrag } from './speed';

export function SpeedSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = speedTarget.value;
  const drag = useRef<SpeedDrag | null>(null);
  /** A pointer went down on the slider and has not been released: its moves are one movement. */
  const held = useRef(false);
  /**
   * Ends the slider movement (one undo step). Also bound to the window's pointerup and pointercancel while
   * a movement is open, so a release outside the slider ends it too (the F-011 volume slider's pattern).
   */
  const endDrag = useRef((): void => {
    removeEventListener('pointerup', endDrag.current);
    removeEventListener('pointercancel', endDrag.current);
    held.current = false;
    drag.current?.end();
    drag.current = null;
  });
  // Leaving the section (deselecting, another tab, closing the sheet) ends an open movement.
  useEffect(() => () => endDrag.current(), []);
  if (!target) return null;
  const headId = `${id}-title`;
  const exactId = `${id}-exact`;
  const end = endDrag.current;
  const options: Option<number>[] = QUICK_SPEEDS.map((pct) => ({
    value: pct,
    key: String(pct),
    label: speedLabel(pct),
  }));
  const quick = (
    <OptionGroup
      id={`${id}-quick`}
      label={t('inspector.speed')}
      labelledBy={headId}
      options={options}
      value={target.speedPct}
      onChoose={(pct) => setSpeedOnce(target.id, pct)}
      variant="segments"
    />
  );
  return (
    <section
      class={touch ? 'tk-speed tk-speed--touch' : 'tk-speed'}
      data-section="speed"
      aria-labelledby={headId}
      data-changed={target.speedPct === RULE_06.defaultPct ? undefined : ''}
    >
      {touch ? (
        // Phone: one row with its label on the left (CMP-Timeline "narrow / sheet open").
        <div class="tk-speed__row">
          <h3 class="tk-speed__label" id={headId}>
            {t('inspector.speed')}
          </h3>
          {quick}
        </div>
      ) : (
        <>
          <h3 class="tk-speed__head">
            <span id={headId}>{t('inspector.speed')}</span>
            <span class="tk-speed__length" data-control="speed-length">
              {t('speed.length', { length: formatDuration(target.length) })}
            </span>
          </h3>
          {quick}
        </>
      )}
      <div class="tk-speed__control">
        <span class="tk-speed__exact" id={exactId}>
          {t('speed.exact')}
        </span>
        <input
          type="range"
          class="tk-speed__slider"
          min={RULE_06.minPct}
          max={RULE_06.maxPct}
          step={RULE_06.stepPct}
          value={target.speedPct}
          aria-labelledby={exactId}
          aria-valuetext={speedLabel(target.speedPct)}
          data-control="speed-slider"
          onPointerDown={() => {
            end();
            // A release anywhere (outside the slider or the page) ends the movement. No pointer capture:
            // in WebKit a captured range input no longer drags its thumb.
            addEventListener('pointerup', end);
            addEventListener('pointercancel', end);
            held.current = true;
          }}
          onInput={(e) => {
            const v = Number(e.currentTarget.value);
            if (held.current) {
              // The movement starts with its first move. Undo or redo mid-drag cut it (F-014 onCut): the
              // slider is controlled, so it shows the restored speed, and the next move starts a new step.
              if (!drag.current?.active) drag.current = beginSpeedDrag(target.id, () => undefined);
              drag.current.set(v);
            } else {
              // A key on the slider: one step per key.
              setSpeedOnce(target.id, v);
            }
            // Controlled: when a stop held the speed, the thumb goes back to the speed in effect.
            e.currentTarget.value = String(speedTarget.peek()?.speedPct ?? v);
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onBlur={end}
          onChange={end}
        />
        <span class="tk-speed__field">
          <NumberField
            class="tk-speed__number"
            control="speed-field"
            min={RULE_06.minPct / 100}
            max={RULE_06.maxPct / 100}
            step={RULE_06.stepPct / 100}
            fractionDigits={2}
            fixedDigits
            value={target.speedPct / 100}
            labelledBy={exactId}
            onCommit={(v) => setSpeedOnce(target.id, Math.round(v * 100)) / 100}
          />
          <span class="tk-speed__unit" aria-hidden="true">
            ×
          </span>
        </span>
      </div>
    </section>
  );
}
