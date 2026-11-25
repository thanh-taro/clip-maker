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
// F-011: the Audio tab (COPY-tab.audio) and its sheet (CMP-Inspector "narrow sheets", D-052): the
// selection's sound (a video or audio clip, at touch size; an audio clip's fades follow), then a full-width
// Music button that opens the file picker for audio files (F-011.R1). The Edit sheet's tiles act on a selected audio clip too (Earlier/Later in time).
// F-004: the first row of tiles is Split, Start here and End here (Cross-fade joins it with F-009); the
// arrange tiles start the second row.
// F-005: with a video clip selected, the setting rows follow the tiles: Speed with its label on the left
// and the six quick segments, then the Exact slider and field at touch size (the fine control, F-005.R1).
// F-006: with a video or photo clip selected, the placement rows come first, as in the inspector: the Position row (label on the left, Fit/Fill, the four
// nudges), the Scale slider row, then Rotate, the flips and Reset at touch size (build question 135); then Speed.
// F-004 (build question 150): with a photo clip selected, the Duration row (label on the left, slider and field at
// touch size, F-004.R8) takes Speed's place.
// F-007: the Adjust tab (COPY-inspector.adjust, last in the bar as style.md orders it) and its sheet
// (`AdjustSheet`); the tab is unavailable unless a video or photo clip is selected (board SCR-Editor default
// narrow), and the sheet closes when the selection stops being one.
// F-008: the Looks tab (COPY-looks.title, before Adjust as style.md orders it; Text joins before it with F-010)
// and its sheet (`LooksSheet`: CMP-LookGallery "narrow / chosen" — grabber, the touch-size group pills, one row
// of None and the four looks, the touch-size Intensity row); like Adjust, the tab is unavailable unless a
// video or photo clip is selected, and the sheet closes when the selection stops being one.
// Implements: F-007 UX notes on narrow layouts, F-003.R6 (visible controls on touch), F-003.AC5, RULE-21 (move-earlier/later stand in for
// hold-and-drag; start-here and end-here stand in for the trim drag; touch-size targets), F-004.R2/R6,
// F-011.R1/R3/R4/R8 on narrow layouts, CMP-Inspector "narrow sheets" (Audio).
// F-009: the Cross-fade tile ends the first row (CROSSFADE_ITEM: it adds a 0.5 s cross-fade after the selected
// clip and opens its popover; unavailable with its reason between clips too short), and the Fades row (two
// toggles, each with its length) with the Fade in / Fade out slider rows follows Speed. Implements: F-009.R1,
// F-009.R2, F-009.R7 on narrow layouts, CMP-Timeline "narrow / sheet open".
// F-010: the Text tab (COPY-inspector.text, between Audio and Looks as style.md orders it) and its sheet
// (`TextSheet`, board SCR-Editor editing-text narrow "Text tab"): the title with the selected layer's text as
// muted meta, Add text (COPY-action.add_text) as an outlined touch-size button, then the selected layer's text
// section at touch size with Reset. The Edit sheet's tiles act on a selected text layer too (Earlier / Later in
// time). Implements: F-010.R1–R4, F-010.R7, F-010.R8 on narrow layouts, RULE-21.
import { effect, signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { layoutOf, frameStart } from '../core';
import { project } from '../project';
import { adjustTarget } from './adjust';
import { AdjustFooter, AdjustSection } from './AdjustSection';
import { LookGallery } from './LookGallery';
import { lookTarget } from './looks';
import { selectedAudio, selectedClip } from './arrange';
import { Icon } from './icons';
import { frameSectionShown } from './frame';
import { FrameSection, useKeepFocus } from './Inspector';
import { addMedia, pickMusic } from './MediaInput';
import { soundTarget } from './sound';
import { SoundSection } from './SoundSection';
import { speedTarget } from './speed';
import { SpeedSection } from './SpeedSection';
import { placementTarget } from './placement';
import { PositionSection } from './PositionSection';
import { ARRANGE_ITEMS, CROSSFADE_ITEM, TRIM_ITEMS } from './Timeline';
import { FadesSection } from './FadesSection';
import { DurationSection } from './DurationSection';
import { durationTarget } from './duration';
import { addTextAndEdit, selectedText } from './text';
import { TextReset, TextSection } from './TextSection';

type Sheet = 'edit' | 'audio' | 'text' | 'looks' | 'adjust';

/** The open sheet of the narrow tab bar (null: none, the default). */
export const openSheet = signal<Sheet | null>(null);

// The Adjust and Looks sheets act on the selected video or photo clip: when there is none any more
// (deselected, deleted, an audio clip selected), the sheet closes (its tab is then unavailable, SCR-Editor
// default narrow).
effect(() => {
  const open = openSheet.value;
  if (open === 'adjust' && adjustTarget.value === null) closeTo(ADJUST_SHEET_ID, ADJUST_TAB_ID);
  else if (open === 'looks' && lookTarget.value === null) closeTo(LOOKS_SHEET_ID, LOOKS_TAB_ID);
});

/** Closes the open sheet; focus inside it goes back to its tab, not to the page. */
function closeTo(sheetId: string, tabId: string): void {
  const inSheet = document.getElementById(sheetId)?.contains(document.activeElement) ?? false;
  openSheet.value = null;
  if (inSheet) document.getElementById(tabId)?.focus();
}

const TAB_ID = 'tk-tab-edit';
const SHEET_ID = 'tk-sheet-edit';
const AUDIO_TAB_ID = 'tk-tab-audio';
const AUDIO_SHEET_ID = 'tk-sheet-audio';
const AUDIO_TITLE_ID = 'tk-sheet-audio-title';
const FRAME_HEAD_ID = 'tk-sheet-frame-title';
const SOUND_HEAD_ID = 'tk-sheet-sound-title';
const ADJUST_TAB_ID = 'tk-tab-adjust';
const ADJUST_SHEET_ID = 'tk-sheet-adjust';
const LOOKS_TAB_ID = 'tk-tab-looks';
const TEXT_TAB_ID = 'tk-tab-text';
const TEXT_SHEET_ID = 'tk-sheet-text';
const LOOKS_SHEET_ID = 'tk-sheet-looks';

/** The tab bar's tabs in style.md order (Edit, Audio, Text, Looks, Adjust). */
const TABS: readonly {
  sheet: Sheet;
  id: string;
  panel: string;
  icon: 'edit' | 'music' | 'text' | 'looks' | 'adjust';
  label: 'inspector.edit' | 'tab.audio' | 'inspector.text' | 'looks.title' | 'inspector.adjust';
  /** The tab can open its sheet now (SCR-Editor default narrow: Adjust needs a video or photo clip). */
  available: () => boolean;
}[] = [
  { sheet: 'edit', id: TAB_ID, panel: SHEET_ID, icon: 'edit', label: 'inspector.edit', available: () => true },
  { sheet: 'audio', id: AUDIO_TAB_ID, panel: AUDIO_SHEET_ID, icon: 'music', label: 'tab.audio', available: () => true },
  {
    sheet: 'text',
    id: TEXT_TAB_ID,
    panel: TEXT_SHEET_ID,
    icon: 'text',
    label: 'inspector.text',
    available: () => true,
  },
  {
    sheet: 'looks',
    id: LOOKS_TAB_ID,
    panel: LOOKS_SHEET_ID,
    icon: 'looks',
    label: 'looks.title',
    available: () => lookTarget.value !== null,
  },
  {
    sheet: 'adjust',
    id: ADJUST_TAB_ID,
    panel: ADJUST_SHEET_ID,
    icon: 'adjust',
    label: 'inspector.adjust',
    available: () => adjustTarget.value !== null,
  },
];

/**
 * The phone tab bar (D-038). Hidden on wide and compact layouts (CSS). ARIA tabs with manual activation
 * (F-017, build questions 90 and 127): one Tab stop (the open tab, else the first); Left and Right (wrapping),
 * Home and End move focus between the tabs, and Enter or Space opens one, since opening a sheet changes the
 * layout. MOD-Keys gives a focused tab these keys (RULE-20 *Scope*).
 */
export function TabBar() {
  const current = TABS.findIndex((tab) => openSheet.value === tab.sheet);
  const onKey = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tabs = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')];
    const at = tabs.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const n = tabs.length;
    const to =
      e.key === 'ArrowRight'
        ? at + 1
        : e.key === 'ArrowLeft'
          ? at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    tabs[(to + n) % n]?.focus();
  };
  return (
    <div class="tk-tabbar">
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs take focus, not the list */}
      <div class="tk-tabbar__tabs" role="tablist" onKeyDown={onKey}>
        {TABS.map((tab, i) => {
          const open = openSheet.value === tab.sheet;
          const available = tab.available();
          return (
            <button
              key={tab.sheet}
              type="button"
              id={tab.id}
              class="tk-tabbar__tab"
              role="tab"
              tabIndex={i === Math.max(0, current) ? 0 : -1}
              aria-selected={open ? 'true' : 'false'}
              aria-controls={open ? tab.panel : undefined}
              aria-disabled={available ? undefined : 'true'}
              onClick={() => {
                if (open) openSheet.value = null;
                else if (tab.available()) openSheet.value = tab.sheet;
              }}
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
  const text = selectedText.value;
  if (text) {
    return (
      <span class="tk-sheet__meta">
        <span class="tk-sheet__name">{text.content.replace(/\s+/g, ' ').trim()}</span>
        <span class="tk-sheet__length">{formatDuration(text.end - text.start)}</span>
      </span>
    );
  }
  const audio = selectedAudio.value;
  if (audio) {
    const p = project.value;
    const name = p.sources.find((s) => s.id === audio.sourceId)?.name ?? '';
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
  const clip = selectedClip.value ?? selectedAudio.value ?? selectedText.value;
  // Tile order of the board: Split, Start here, End here, Cross-fade / Move earlier, Move later, Duplicate,
  // Delete (in danger).
  const tiles = [
    ...TRIM_ITEMS,
    CROSSFADE_ITEM,
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
            // F-009.R7: an unavailable control with a reason says why (and shows it as a notice when activated).
            const reason = available ? null : (item.reason?.() ?? null);
            const reasonId = `tk-sheet-tile-${item.id}-reason`;
            return (
              <button
                key={item.id}
                type="button"
                class={item.id === 'delete' ? 'tk-tile tk-tile--danger' : 'tk-tile'}
                data-action={item.id}
                aria-disabled={available ? undefined : 'true'}
                aria-describedby={reason ? reasonId : undefined}
                title={reason ?? undefined}
                onClick={(e) => {
                  if (item.available() || item.reason?.()) item.run(e.currentTarget);
                }}
              >
                <Icon name={item.icon} size={20} />
                <span class="tk-tile__label">{t(item.labelNow?.() ?? item.label)}</span>
              </button>
            );
          })}
        </div>
        {tiles.map((item) => {
          const reason = item.available() ? null : (item.reason?.() ?? null);
          return reason ? (
            <span key={item.id} class="tk-join-reason" id={`tk-sheet-tile-${item.id}-reason`}>
              {reason}
            </span>
          ) : null;
        })}
        {placementTarget.value ? <PositionSection id="tk-sheet-place" touch /> : null}
        {speedTarget.value ? <SpeedSection id="tk-sheet-speed" touch /> : null}
        {durationTarget.value ? <DurationSection id="tk-sheet-duration" touch /> : null}
        <FadesSection id="tk-sheet-fades" touch />
      </div>
    </section>
  );
}

/**
 * The Text sheet (style.md "Layouts" narrow: Text holds Add text and the text style; board SCR-Editor
 * editing-text narrow "Text tab"): grabber, the title COPY-inspector.text with the selected layer's text as
 * muted meta and Add text, then the selected layer's text section at touch size, with Reset.
 */
export function TextSheet() {
  const open = openSheet.value === 'text';
  const ref = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const layer = selectedText.value;
  useKeepFocus(ref, title, layer?.id ?? null);
  useSheetEsc(open, ref, TEXT_TAB_ID);
  if (!open) return null;
  return (
    <section ref={ref} id={TEXT_SHEET_ID} class="tk-sheet tk-sheet--text" role="tabpanel" aria-labelledby={TEXT_TAB_ID}>
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <header class="tk-sheet__head tk-sheet__head--text">
          <h2 ref={title} class="tk-sheet__title" tabIndex={-1}>
            {t('inspector.text')}
          </h2>
          <SelectionMeta />
          <button
            type="button"
            class="tk-button tk-button--outlined-accent tk-sheet__add tk-sheet__add--text"
            data-action="add-text"
            onClick={() => void addTextAndEdit()}
          >
            <Icon name="addMedia" size={16} />
            {t('action.add_text')}
          </button>
        </header>
        {layer ? (
          <>
            <div class="tk-sheet__reset">
              <TextReset layer={layer} />
            </div>
            <TextSection id="tk-sheet-text" touch />
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The Audio sheet (CMP-Inspector "narrow sheets", D-052): grabber, the title COPY-tab.audio with Close, the
 * selection's sound section at touch size when a video or audio clip is selected (build question 112; for an
 * audio clip its fades follow, F-009.R4), then the full-width touch-size Music button (COPY-action.music)
 * that opens the file picker for audio files. Implements: F-011.R1 on narrow layouts.
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
            {t('tab.audio')}
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
        <button
          type="button"
          class="tk-button tk-button--outlined-accent tk-sheet__add"
          data-action="music"
          onClick={pickMusic}
        >
          <Icon name="music" size={16} />
          {t('action.music')}
        </button>
      </div>
    </section>
  );
}

/**
 * The Adjust sheet (style.md "Layouts" narrow: the 12 adjustments, Hold to compare, Apply to all and
 * copy/paste colour; CMP-Inspector "narrow sheets"): grabber, the Adjust rows at touch size under the title
 * Adjust with Reset all, and a sticky footer of one touch-size row — Hold to compare (fills the row), Apply
 * to all clips, and More with Copy colour and Paste colour. Only while a video or photo clip is selected.
 */
export function AdjustSheet() {
  const open = openSheet.value === 'adjust';
  const ref = useRef<HTMLElement>(null);
  useSheetEsc(open, ref, ADJUST_TAB_ID);
  if (!open || !adjustTarget.value) return null;
  return (
    <section
      ref={ref}
      id={ADJUST_SHEET_ID}
      class="tk-sheet tk-sheet--adjust"
      role="tabpanel"
      aria-labelledby={ADJUST_TAB_ID}
    >
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <AdjustSection id="tk-sheet-adjust" touch />
      </div>
      <AdjustFooter id="tk-sheet-adjust" touch />
    </section>
  );
}

/**
 * The Looks sheet (style.md "Layouts" narrow; CMP-LookGallery "narrow / chosen"): grabber, the touch-size
 * group pills, one row of None and the group's four looks, and the touch-size Intensity row. Only while a
 * video or photo clip is selected.
 */
export function LooksSheet() {
  const open = openSheet.value === 'looks';
  const ref = useRef<HTMLElement>(null);
  useSheetEsc(open, ref, LOOKS_TAB_ID);
  if (!open || !lookTarget.value) return null;
  return (
    <section
      ref={ref}
      id={LOOKS_SHEET_ID}
      class="tk-sheet tk-sheet--looks"
      role="tabpanel"
      aria-labelledby={LOOKS_TAB_ID}
    >
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <LookGallery id="tk-sheet-looks" touch />
      </div>
    </section>
  );
}
