// MOD-App — the phone tab bar and its Edit sheet (style.md "Layouts" narrow, D-038; CMP-Timeline
// "narrow / sheet open"; boards SCR-Editor selected / default narrow). Narrow layouts only (< 700 px):
// the tab bar sits above the status row; a tab opens its tools as a bottom sheet docked above the tab
// bar, under the transport and a timeline peek (ruler and main track), at most 40 % of the height (60 %
// under 640 px tall), its body scrolling. No sheet is open by default.
// Built with F-003: the Edit tab, and in its sheet the header (COPY-inspector.label with the selection's
// name and length), Add media, and the arrange tiles Move earlier, Move later, Duplicate and Delete.
// F-012: with nothing selected, the frame section (COPY-inspector.frame) follows Add media, at touch
// size (style.md "Layouts" narrow: Edit holds Add media, Frame when nothing is selected, then the
// selection's actions). The Text, Looks and Adjust tabs, the Cross-fade tile
// and the setting rows join with their features (F-005 to F-010).
// F-011: the Audio tab (COPY-tab.audio) and its sheet: the selection's sound (a video or audio clip, at
// touch size) and CMP-MusicPicker's narrow body (your audio, the bundled tracks); switching away from it
// stops the preview. The Edit sheet's tiles act on a selected audio clip too (Earlier/Later in time).
// F-004: the first row of tiles is Split, Start here and End here (Cross-fade joins it with F-009); the
// arrange tiles start the second row.
// Implements: F-003.R6 (visible controls on touch), F-003.AC5, RULE-21 (move-earlier/later stand in for
// hold-and-drag; start-here and end-here stand in for the trim drag; touch-size targets), F-004.R2/R6,
// F-011.R1/R3/R4/R8 on narrow layouts, CMP-MusicPicker "narrow".
import { effect, signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { layoutOf, frameStart } from '../core';
import { project } from '../project';
import { MUSIC_TRACKS } from '../core';
import { selectedAudio, selectedClip } from './arrange';
import { Icon } from './icons';
import { frameSectionShown } from './frame';
import { FrameSection, useKeepFocus } from './Inspector';
import { addMedia } from './MediaInput';
import { MusicBody } from './MusicPicker';
import { soundTarget, stopPreview } from './sound';
import { SoundSection } from './SoundSection';
import { ARRANGE_ITEMS, TRIM_ITEMS } from './Timeline';

type Sheet = 'edit' | 'audio';

/** The open sheet of the narrow tab bar (null: none, the default). */
export const openSheet = signal<Sheet | null>(null);

// CMP-MusicPicker "Behavior": closing the picker (the Audio sheet) stops its preview.
effect(() => {
  if (openSheet.value !== 'audio') stopPreview();
});

const TAB_ID = 'tk-tab-edit';
const SHEET_ID = 'tk-sheet-edit';
const AUDIO_TAB_ID = 'tk-tab-audio';
const AUDIO_SHEET_ID = 'tk-sheet-audio';
const AUDIO_TITLE_ID = 'tk-sheet-audio-title';
const FRAME_HEAD_ID = 'tk-sheet-frame-title';
const SOUND_HEAD_ID = 'tk-sheet-sound-title';

const TABS: readonly {
  sheet: Sheet;
  id: string;
  panel: string;
  icon: 'edit' | 'music';
  label: 'inspector.edit' | 'tab.audio';
}[] = [
  { sheet: 'edit', id: TAB_ID, panel: SHEET_ID, icon: 'edit', label: 'inspector.edit' },
  { sheet: 'audio', id: AUDIO_TAB_ID, panel: AUDIO_SHEET_ID, icon: 'music', label: 'tab.audio' },
];

/** The phone tab bar (D-038). Hidden on wide and compact layouts (CSS). */
export function TabBar() {
  return (
    <div class="tk-tabbar">
      <div class="tk-tabbar__tabs" role="tablist">
        {TABS.map((tab) => {
          const open = openSheet.value === tab.sheet;
          return (
            <button
              key={tab.sheet}
              type="button"
              id={tab.id}
              class="tk-tabbar__tab"
              role="tab"
              aria-selected={open ? 'true' : 'false'}
              aria-controls={open ? tab.panel : undefined}
              onClick={() => (openSheet.value = open ? null : tab.sheet)}
            >
              <Icon name={tab.icon} size={20} />
              <span>{t(tab.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Esc in an open sheet closes it and returns focus to its tab. */
function useSheetEsc(open: boolean, ref: { readonly current: HTMLElement | null }, tabId: string): void {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || !ref.current?.contains(document.activeElement)) return;
      e.preventDefault();
      openSheet.value = null;
      document.getElementById(tabId)?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}

/** The selection's name and length as muted meta in the sheet header. */
function SelectionMeta() {
  const audio = selectedAudio.value;
  if (audio) {
    const p = project.value;
    const name =
      p.sources.find((s) => s.id === audio.sourceId)?.name ??
      MUSIC_TRACKS.find((m) => m.id === audio.sourceId)?.title ??
      '';
    return (
      <span class="tk-sheet__meta">
        <span class="tk-sheet__name">{name}</span>
        <span class="tk-sheet__length">{formatDuration(audio.out - audio.in)}</span>
      </span>
    );
  }
  const clip = selectedClip.value;
  if (!clip) return null;
  const p = project.value;
  const i = p.clips.indexOf(clip);
  const span = layoutOf(p).spans[i];
  const length = span ? frameStart(span.frames, p.frame.frameRate) : 0;
  const name = p.sources.find((s) => s.id === clip.sourceId)?.name ?? '';
  return (
    <span class="tk-sheet__meta">
      <span class="tk-sheet__name">{name}</span>
      <span class="tk-sheet__length">{formatDuration(length)}</span>
    </span>
  );
}

/** The Edit sheet (CMP-Timeline "narrow / sheet open"). */
export function EditSheet() {
  const open = openSheet.value === 'edit';
  const ref = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const frame = frameSectionShown.value;
  useKeepFocus(ref, title, frame);
  useSheetEsc(open, ref, TAB_ID);
  if (!open) return null;
  const clip = selectedClip.value ?? selectedAudio.value;
  // Tile order of the board: Split, Start here, End here, (Cross-fade, F-009) / Move earlier, Move later,
  // Duplicate, Delete (in danger).
  const tiles = [
    ...TRIM_ITEMS,
    ...['move-earlier', 'move-later', 'duplicate', 'delete'].map((id) => ARRANGE_ITEMS.find((i) => i.id === id)!),
  ];
  return (
    <section ref={ref} id={SHEET_ID} class="tk-sheet" role="tabpanel" aria-labelledby={TAB_ID}>
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <header class="tk-sheet__head">
          <h2 ref={title} class="tk-sheet__title" tabIndex={-1}>
            {clip ? t('inspector.label') : t('inspector.edit')}
          </h2>
          <SelectionMeta />
        </header>
        <button
          type="button"
          class="tk-button tk-button--outlined-accent tk-sheet__add"
          data-action="add-media"
          onClick={addMedia}
        >
          <Icon name="addMedia" size={16} />
          {t('action.add_media')}
        </button>
        {frame ? (
          <section class="tk-sheet__section" aria-labelledby={FRAME_HEAD_ID}>
            <h3 class="tk-sheet__section-title" id={FRAME_HEAD_ID}>
              {t('inspector.frame')}
            </h3>
            <FrameSection id="tk-sheet-frame" touch />
          </section>
        ) : null}
        <div class="tk-sheet__grid">
          {tiles.map((item) => {
            const available = item.available();
            return (
              <button
                key={item.id}
                type="button"
                class={item.id === 'delete' ? 'tk-tile tk-tile--danger' : 'tk-tile'}
                data-action={item.id}
                aria-disabled={available ? undefined : 'true'}
                onClick={() => {
                  if (item.available()) item.run();
                }}
              >
                <Icon name={item.icon} size={20} />
                <span class="tk-tile__label">{t(item.labelNow?.() ?? item.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * The Audio sheet (style.md "Layouts" narrow: Music, your audio and the selection's sound; CMP-MusicPicker
 * "narrow"): grabber, the title COPY-music.title with Close, the selection's sound section when a video or
 * audio clip is selected (build question 112), then the your-audio row and the touch-size track rows.
 */
export function AudioSheet() {
  const open = openSheet.value === 'audio';
  const ref = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const sound = soundTarget.value !== null;
  useKeepFocus(ref, title, sound);
  useSheetEsc(open, ref, AUDIO_TAB_ID);
  if (!open) return null;
  return (
    <section
      ref={ref}
      id={AUDIO_SHEET_ID}
      class="tk-sheet tk-sheet--audio"
      role="tabpanel"
      aria-labelledby={AUDIO_TAB_ID}
    >
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <header class="tk-sheet__head tk-sheet__head--close">
          <h2 ref={title} class="tk-sheet__title" id={AUDIO_TITLE_ID} tabIndex={-1}>
            {t('music.title')}
          </h2>
          <button
            type="button"
            class="tk-icon-button tk-sheet__close"
            aria-label={t('action.close')}
            title={t('action.close')}
            data-action="close"
            onClick={() => {
              openSheet.value = null;
              document.getElementById(AUDIO_TAB_ID)?.focus();
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        {sound ? (
          <section class="tk-sheet__section" aria-labelledby={SOUND_HEAD_ID}>
            <h3 class="tk-sheet__section-title" id={SOUND_HEAD_ID}>
              {t('inspector.sound')}
            </h3>
            <SoundSection id="tk-sheet-sound" touch />
          </section>
        ) : null}
        <div class="tk-music tk-music--sheet">
          <MusicBody touch titleId={AUDIO_TITLE_ID} />
        </div>
      </div>
    </section>
  );
}
