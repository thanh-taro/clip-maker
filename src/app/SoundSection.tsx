// MOD-App — CMP-Inspector's sound section (specs/30-experience/components/CMP-Inspector.md "Sound ·
// vi-VN (all original muted)" and "audio clip"; board CMP-Inspector): Volume (COPY-sound.volume, 0–200 %,
// a centre mark at 100 %) as a slider with its paired number field, an inline Mute toggle (COPY-action.mute,
// pressed while muted); for a video clip, Mute original sound / Unmute original sound (COPY-action.mute_all,
// COPY-action.unmute_all) with the row dimmed while every main-track clip is muted; for an audio clip, the
// text-and-icon Earlier and Later (COPY-action.time_earlier, COPY-action.time_later). The audio clip's Fade
// in and Fade out rows come with F-009. Used by the docked inspector and, at touch size, the phone Audio
// sheet (D-038).
// Implements: F-011.R3 (volume 0–200 % and mute for any video clip or audio clip), F-011.R4 (Mute original
// sound as one step, then Unmute), F-011.R8 (Earlier/Later without dragging), CMP-Inspector "Behavior"
// (slider drags update live and are one undo step; fields clamp to the rule's range) and "Accessibility"
// (the slider and its field share the label; the toggle exposes a pressed state).
import { useRef } from 'preact/hooks';
import { t } from '../copy';
import { RULE_12 } from '../core';
import { arrangeAvailable, moveSelected } from './arrange';
import { Icon } from './icons';
import { originalMuted, setMute, setVolumeOnce, soundTarget, toggleMuteAll, volumeGesture } from './sound';

export function SoundSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = soundTarget.value;
  const gesture = useRef<ReturnType<typeof volumeGesture> | null>(null);
  if (!target) return null;
  const labelId = `${id}-volume-label`;
  const allMuted = target.kind === 'video' && originalMuted.value;
  const endGesture = (): void => {
    gesture.current?.end();
    gesture.current = null;
  };
  const available = arrangeAvailable.value;
  return (
    <div
      class={touch ? 'tk-sound tk-sound--touch' : 'tk-sound'}
      data-section="sound"
      data-dimmed={allMuted ? '' : undefined}
    >
      <div class="tk-sound__row">
        <span class="tk-sound__label" id={labelId}>
          {t('sound.volume')}
        </span>
        <button
          type="button"
          class="tk-button tk-sound__mute"
          aria-pressed={target.muted ? 'true' : 'false'}
          data-action="mute"
          onClick={() => setMute(target.id, !target.muted)}
        >
          <Icon name={target.muted ? 'muted' : 'volume'} size={16} />
          {t('action.mute')}
        </button>
      </div>
      <div class="tk-sound__control">
        <span class="tk-sound__track">
          <input
            type="range"
            class="tk-sound__slider"
            min={RULE_12.minVolume}
            max={RULE_12.maxVolume}
            step={1}
            value={target.volume}
            aria-labelledby={labelId}
            aria-valuetext={`${target.volume} %`}
            data-control="volume-slider"

            onPointerDown={() => {
              endGesture();
              // Undo or redo mid-drag: the gesture starts a new step by itself (F-014); the slider is controlled.
              gesture.current = volumeGesture(target.id, () => undefined);
            }}
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              if (gesture.current) gesture.current.set(v);
              else setVolumeOnce(target.id, v);
            }}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onChange={endGesture}
          />
          <span class="tk-sound__centre" aria-hidden="true" />
        </span>
        <span class="tk-sound__field">
          <input
            type="number"
            inputMode="numeric"
            class="tk-sound__number"
            min={RULE_12.minVolume}
            max={RULE_12.maxVolume}
            step={1}
            value={target.volume}
            aria-labelledby={labelId}
            data-control="volume-field"
            onChange={(e) => {
              const el = e.currentTarget;
              setVolumeOnce(target.id, Number(el.value));
              // A typed value out of range shows the clamped one (RULE-12).
              el.value = String(soundTarget.peek()?.volume ?? target.volume);
            }}
          />
          <span class="tk-sound__unit" aria-hidden="true">
            %
          </span>
        </span>
      </div>
      {target.kind === 'video' ? (
        <button type="button" class="tk-button tk-sound__all" data-action="mute-all" onClick={toggleMuteAll}>
          <Icon name={allMuted ? 'volume' : 'muted'} size={16} />
          {t(allMuted ? 'action.unmute_all' : 'action.mute_all')}
        </button>
      ) : (
        <div class="tk-sound__times">
          <button
            type="button"
            class="tk-button tk-sound__time"
            data-action="time-earlier"
            aria-disabled={available.earlier ? undefined : 'true'}
            onClick={() => available.earlier && moveSelected('earlier')}
          >
            <Icon name="moveEarlier" size={16} />
            {t('action.time_earlier')}
          </button>
          <button
            type="button"
            class="tk-button tk-sound__time"
            data-action="time-later"
            aria-disabled={available.later ? undefined : 'true'}
            onClick={() => available.later && moveSelected('later')}
          >
            {t('action.time_later')}
            <Icon name="moveLater" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
