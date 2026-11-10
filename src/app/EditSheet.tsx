// MOD-App — the phone tab bar and its Edit sheet (style.md "Layouts" narrow, D-038; CMP-Timeline
// "narrow / sheet open"; boards SCR-Editor selected / default narrow). Narrow layouts only (< 700 px):
// the tab bar sits above the status row; a tab opens its tools as a bottom sheet docked above the tab
// bar, under the transport and a timeline peek (ruler and main track), at most 40 % of the height (60 %
// under 640 px tall), its body scrolling. No sheet is open by default.
// Built with F-003: the Edit tab, and in its sheet the header (COPY-inspector.label with the selection's
// name and length), Add media, and the arrange tiles Move earlier, Move later, Duplicate and Delete. The
// Audio, Text, Looks and Adjust tabs, the Split / Start here / End here / Cross-fade tiles and the
// setting rows join with their features (F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011, F-012).
// Implements: F-003.R6 (visible controls on touch), F-003.AC5, RULE-21 (move-earlier/later stand in for
// hold-and-drag; touch-size targets).
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { layoutOf, frameStart } from '../core';
import { project } from '../project';
import { selectedClip } from './arrange';
import { Icon } from './icons';
import { addMedia } from './MediaInput';
import { ARRANGE_ITEMS } from './Timeline';

/** The open sheet of the narrow tab bar (null: none, the default). */
export const openSheet = signal<'edit' | null>(null);

const TAB_ID = 'tk-tab-edit';
const SHEET_ID = 'tk-sheet-edit';

/** The phone tab bar (D-038). Hidden on wide and compact layouts (CSS). */
export function TabBar() {
  const open = openSheet.value === 'edit';
  return (
    <div class="tk-tabbar">
      <div class="tk-tabbar__tabs" role="tablist">
        <button
          type="button"
          id={TAB_ID}
          class="tk-tabbar__tab"
          role="tab"
          aria-selected={open ? 'true' : 'false'}
          aria-controls={open ? SHEET_ID : undefined}
          onClick={() => (openSheet.value = open ? null : 'edit')}
        >
          <Icon name="edit" size={20} />
          <span>{t('inspector.edit')}</span>
        </button>
      </div>
    </div>
  );
}

/** The selection's name and length as muted meta in the sheet header. */
function SelectionMeta() {
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
  // Esc in the sheet closes it and returns focus to its tab.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || !ref.current?.contains(document.activeElement)) return;
      e.preventDefault();
      openSheet.value = null;
      document.getElementById(TAB_ID)?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const clip = selectedClip.value;
  // Tile order of the board: Move earlier, Move later, Duplicate, Delete (in danger).
  const tiles = ['move-earlier', 'move-later', 'duplicate', 'delete'].map((id) =>
    ARRANGE_ITEMS.find((i) => i.id === id)!,
  );
  return (
    <section ref={ref} id={SHEET_ID} class="tk-sheet" role="tabpanel" aria-labelledby={TAB_ID}>
      <span class="tk-sheet__grabber" aria-hidden="true" />
      <div class="tk-sheet__body">
        <header class="tk-sheet__head">
          <h2 class="tk-sheet__title">{clip ? t('inspector.label') : t('inspector.edit')}</h2>
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
                <span class="tk-tile__label">{t(item.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
