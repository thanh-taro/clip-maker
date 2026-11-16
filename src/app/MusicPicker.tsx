// MOD-App — CMP-MusicPicker (specs/30-experience/components/CMP-MusicPicker.md; board CMP-MusicPicker):
// browse and preview the bundled music, then add a track at the playhead. Wide and compact layouts: a
// popover (`size.popover`) anchored to the toolbar's Music; narrow layouts: the Audio tab's sheet (D-038)
// renders the same body (`AudioSheet` in ./EditSheet.tsx). The picker is a dialog named COPY-music.title; the tracks
// form a list; each row has its Play preview toggle (pressed while it plays; its name includes the title),
// the title, the length in m:ss, source and licence, and Add at playhead. Only one preview plays at a
// time; closing the picker stops it. Esc closes and returns focus to Music.
// Implements: F-011.R1 (preview and place), F-011.R6 (title, source and licence on every row), F-011.R7
// (the tracks are the tool's own files: MOD-Assets), CMP-MusicPicker variants and accessibility.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { Icon } from './icons';
import { pickAudio } from './MediaInput';
import { auditionTrack, playback } from './playback';
import { addTrack, closePicker, noRoom, pickerOpen, togglePreview, tracks } from './sound';
import { noticesRequest } from './StatusBar';

export const PICKER_TITLE_ID = 'tk-music-title';

/** The previewing row's progress (0–1), read from MOD-Audio's audition clock each frame while it plays. */
function useAuditionProgress(trackId: string | null, duration: number): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    if (!trackId || duration <= 0) return undefined;
    let frame = 0;
    const tick = (): void => {
      const clock = playback.peek()?.clock;
      setProgress(Math.min(1, (clock?.auditionTime() ?? 0) / duration));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trackId, duration]);
  return progress;
}

/** One track row (CMP-MusicPicker "row / …"). `touch`: the narrow sheet's touch-size row. */
function TrackRow({ id, touch }: { id: string; touch: boolean }) {
  const track = tracks.find((x) => x.id === id)!;
  const previewing = auditionTrack.value === id;
  const full = noRoom.value.has(id);
  const progress = useAuditionProgress(previewing ? id : null, track.duration);
  const noteId = `tk-music-noroom-${id}`;
  const previewName = `${t(previewing ? 'music.stop' : 'music.preview')}: ${track.title}`;
  return (
    <li class="tk-music__row" data-track={id} data-previewing={previewing ? '' : undefined}>
      <button
        type="button"
        class="tk-icon-button tk-music__preview"
        aria-pressed={previewing ? 'true' : 'false'}
        aria-label={previewName}
        title={previewName}
        data-action="preview"
        onClick={() => togglePreview(id)}
      >
        <Icon name={previewing ? 'stop' : 'play'} size={16} />
      </button>
      <div class="tk-music__text">
        <span class="tk-music__title">{track.title}</span>
        <span class="tk-music__meta">
          <span class="tk-music__length">{formatDuration(track.duration)}</span>
          <span class="tk-music__licence">{track.licence}</span>
        </span>
        <span class="tk-music__source">{track.source}</span>
        {full ? (
          <span class="tk-music__noroom" id={noteId} data-notice="no_audio_room">
            {t('notice.no_audio_room')}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        class={
          previewing && !touch ? 'tk-button tk-music__add tk-music__add--labelled' : 'tk-icon-button tk-music__add'
        }
        aria-label={previewing && !touch ? undefined : t('music.add')}
        title={previewing && !touch ? undefined : t('music.add')}
        aria-disabled={full ? 'true' : undefined}
        aria-describedby={full ? noteId : undefined}
        data-action="add"
        onClick={() => {
          if (!full) addTrack(id);
        }}
      >
        <Icon name="addMedia" size={16} />
        {previewing && !touch ? <span>{t('music.add')}</span> : null}
      </button>
      {previewing ? (
        <span class="tk-music__progress" aria-hidden="true" style={{ inlineSize: `${progress * 100}%` }} />
      ) : null}
    </li>
  );
}

/** The picker's body: the your-audio row, the track list and the licences link (shared by both variants). */
export function MusicBody({ touch = false, titleId = PICKER_TITLE_ID }: { touch?: boolean; titleId?: string }) {
  return (
    <>
      <div class="tk-music__yours">
        <p class="tk-music__hint">{t('music.your_audio_hint')}</p>
        <button
          type="button"
          class={touch ? 'tk-button tk-button--outlined-accent tk-music__your-audio' : 'tk-button tk-music__your-audio'}
          data-action="your-audio"
          onClick={pickAudio}
        >
          <Icon name="upload" size={16} />
          {t('music.your_audio')}
        </button>
      </div>
      <ul class="tk-music__list" aria-labelledby={titleId}>
        {tracks.map((track) => (
          <TrackRow key={track.id} id={track.id} touch={touch} />
        ))}
      </ul>
      <button
        type="button"
        class="tk-music__notices"
        data-copy="privacy.notices"
        onClick={() => noticesRequest.value++}
      >
        {t('privacy.notices')}
      </button>
    </>
  );
}

/**
 * CMP-MusicPicker "popover / previewing": the wide and compact popover under Music. Esc, Close or a press
 * outside closes it (and stops the preview); Esc and Close return focus to Music.
 */
export function MusicPopover({ anchor }: { anchor: () => HTMLElement | null }) {
  const open = pickerOpen.value;
  const root = useRef<HTMLElement>(null);
  const close = (returnFocus: boolean): void => {
    closePicker();
    if (returnFocus) anchor()?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector<HTMLElement>('.tk-music__preview')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return; // the notices view takes its own Esc
      e.preventDefault();
      close(true);
    };
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node | null;
      if (!target || root.current?.contains(target) || anchor()?.contains(target)) return;
      if ((target as Element).closest?.('dialog, .tk-timeline, .tk-preview-area, .tk-inspector')) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);
  if (!open) return null;
  return (
    <section ref={root} class="tk-music tk-music--popover" role="dialog" aria-labelledby={PICKER_TITLE_ID}>
      <header class="tk-music__head">
        <h2 class="tk-music__heading" id={PICKER_TITLE_ID}>
          {t('music.title')}
        </h2>
        <button
          type="button"
          class="tk-icon-button"
          aria-label={t('action.close')}
          title={t('action.close')}
          data-action="close"
          onClick={() => close(true)}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      <MusicBody />
    </section>
  );
}
