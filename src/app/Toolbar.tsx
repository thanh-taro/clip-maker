// MOD-App — CMP-Toolbar, empty-project state (specs/30-experience/components/CMP-Toolbar.md).
// The buttons and their labels in both languages. Wired so far: Add media (F-001), Music (F-011: opens
// CMP-MusicPicker as a popover under it), Undo and Redo (F-014: unavailable when there is nothing to undo
// or redo, and the RULE-20 history keys), Add text (F-010.R1: a layer at the playhead with CMP-TextEditor open on
// it; while editing, the narrow top bar collapses to Undo, Redo and Done); the other actions come with F-015,
// F-017 and F-018. Labels collapse to icons (compact) and the narrow top bar of D-038 is CSS on the tool's width
// (layout.css, text.css).
import { useEffect } from 'preact/hooks';
import { t, type MessageId, type MessageParams } from '../copy';

/** COPY action labels that take no parameters. */
type ActionLabel = {
  [K in MessageId]: K extends `action.${string}` ? (MessageParams[K] extends undefined ? K : never) : never;
}[MessageId];
import { needsClip } from './adding';
import { bindHistoryKeys, historyAvailable, redoEdit, undoEdit } from './history';
import { Icon, type IconName } from './icons';
import { addMedia } from './MediaInput';
import { MusicPopover } from './MusicPicker';
import { closePicker, openPicker, pickerOpen } from './sound';
import { addTextAndEdit, editingText } from './text';
import { DoneButton } from './TextEditor';

/** Toolbar's Music button (the picker's anchor; Esc and Close return focus to it). */
let musicButton: HTMLButtonElement | null = null;

/** F-011 / CMP-Toolbar: Music opens CMP-MusicPicker; activating it again closes it. */
function toggleMusic(): void {
  if (pickerOpen.peek()) closePicker();
  else openPicker();
}

interface Item {
  readonly id: string;
  readonly label: ActionLabel;
  readonly icon: IconName;
  /** Wide layout shows the label next to the icon. */
  readonly labelled?: boolean;
  /** Visible on the narrow top bar (D-038); the rest move into More. */
  readonly narrow?: boolean;
  readonly primary?: boolean;
}

/**
 * Implements: F-014.R1, CMP-Toolbar — Undo and Redo, each unavailable when there is nothing to undo or
 * redo. Unavailable is `aria-disabled` (announced, legible, and still focusable), so keyboard focus
 * stays on the button when its last step is used.
 */
const HISTORY: Partial<Record<string, { readonly available: () => boolean; readonly run: () => boolean }>> = {
  undo: { available: () => historyAvailable.value.undo, run: undoEdit },
  redo: { available: () => historyAvailable.value.redo, run: redoEdit },
};

const ITEMS: readonly Item[] = [
  { id: 'add-media', label: 'action.add_media', icon: 'addMedia', labelled: true },
  { id: 'music', label: 'action.music', icon: 'music', labelled: true },
  { id: 'add-text', label: 'action.add_text', icon: 'text', labelled: true },
  { id: 'undo', label: 'action.undo', icon: 'undo', narrow: true },
  { id: 'redo', label: 'action.redo', icon: 'redo', narrow: true },
  { id: 'shortcuts', label: 'action.shortcuts', icon: 'shortcuts' },
  { id: 'new-project', label: 'action.new_project', icon: 'newProject', labelled: true },
];

function ToolButton({ item }: { item: Item }) {
  const name = t(item.label);
  const history = HISTORY[item.id];
  const unavailable = history ? !history.available() : false;
  const music = item.id === 'music';
  const onClick = history
    ? () => void history.run()
    : item.id === 'add-media'
      ? addMedia
      : music
        ? toggleMusic
        : item.id === 'add-text'
          ? // F-010.R1: Add text adds a layer at the playhead and opens CMP-TextEditor on it.
            () => void addTextAndEdit()
          : undefined;
  return (
    <button
      ref={(el: HTMLButtonElement | null) => {
        if (music) musicButton = el;
      }}
      aria-haspopup={music ? 'dialog' : undefined}
      aria-expanded={music ? (pickerOpen.value ? 'true' : 'false') : undefined}
      type="button"
      class={[
        'tk-tool',
        item.labelled ? 'tk-tool--labelled' : '',
        item.narrow ? 'tk-tool--narrow' : '',
        item.primary ? 'tk-tool--primary' : '',
      ].join(' ')}
      data-action={item.id}
      aria-label={item.labelled ? undefined : name}
      title={name}
      aria-disabled={unavailable ? 'true' : undefined}
      onClick={onClick}
    >
      <Icon name={item.icon} size={20} />
      {item.labelled ? <span class="tk-tool__label">{name}</span> : null}
    </button>
  );
}

export function Toolbar() {
  useEffect(() => bindHistoryKeys(), []);
  return (
    <header class="tk-toolbar-region">
      <div class="tk-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
        <button
          type="button"
          class="tk-tool tk-tool--more"
          data-action="more"
          aria-label={t('action.more')}
          title={t('action.more')}
          aria-haspopup="menu"
          aria-expanded="false"
        >
          <Icon name="more" size={20} />
        </button>
        {ITEMS.slice(0, 5).map((item) => (
          <ToolButton key={item.id} item={item} />
        ))}
        <span class="tk-toolbar__gap" />
        {ITEMS.slice(5).map((item) => (
          <ToolButton key={item.id} item={item} />
        ))}
        {needsClip.value ? <NeedsClip /> : null}
        {/* CMP-TextEditor "narrow, keyboard open": Done lives only in the top bar (shown on narrow layouts). */}
        {editingText.value !== null ? <DoneButton variant="top" /> : null}
        <button type="button" class="tk-tool tk-tool--export" data-action="export" disabled>
          <Icon name="export" size={20} />
          <span class="tk-tool__label">{t('action.export')}</span>
        </button>
      </div>
      {needsClip.value ? <NeedsClip narrow /> : null}
      <MusicPopover anchor={() => musicButton} />
    </header>
  );
}

/**
 * Implements: F-001.AC11, RULE-03, CMP-Toolbar — why Export is unavailable: COPY-notice.needs_clip next
 * to Export on wide layouts, under the bar on narrow ones (only one of the two is displayed).
 */
function NeedsClip({ narrow = false }: { narrow?: boolean }) {
  return (
    <p class={narrow ? 'tk-needs-clip tk-needs-clip--narrow' : 'tk-needs-clip'} data-notice="needs_clip">
      <Icon name="info" size={16} />
      {t('notice.needs_clip')}
    </p>
  );
}
