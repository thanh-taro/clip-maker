// MOD-App — CMP-Toolbar, empty-project state (specs/30-experience/components/CMP-Toolbar.md).
// Phase 3.3 skeleton: the buttons and their labels in both languages, with the empty project's
// unavailable Undo, Redo and Export; the actions are wired in phase 4 (F-001, F-010, F-011, F-014,
// F-015, F-017, F-018). Labels collapse to icons (compact) and the narrow top bar of D-038 is CSS
// on the tool's width (layout.css).
import { t, type MessageId, type MessageParams } from '../copy';

/** COPY action labels that take no parameters. */
type ActionLabel = {
  [K in MessageId]: K extends `action.${string}` ? (MessageParams[K] extends undefined ? K : never) : never;
}[MessageId];
import { needsClip } from './adding';
import { acceptsMedia } from './device';
import { Icon, type IconName } from './icons';
import { addMedia } from './MediaInput';

interface Item {
  readonly id: string;
  readonly label: ActionLabel;
  readonly icon: IconName;
  /** Wide layout shows the label next to the icon. */
  readonly labelled?: boolean;
  /** Visible on the narrow top bar (D-038); the rest move into More. */
  readonly narrow?: boolean;
  /** Unavailable in the empty project (SCR-Editor "Unavailable controls"). */
  readonly disabled?: boolean;
  readonly primary?: boolean;
}

const ITEMS: readonly Item[] = [
  { id: 'add-media', label: 'action.add_media', icon: 'addMedia', labelled: true },
  { id: 'music', label: 'action.music', icon: 'music', labelled: true },
  { id: 'add-text', label: 'action.add_text', icon: 'text', labelled: true },
  { id: 'undo', label: 'action.undo', icon: 'undo', narrow: true, disabled: true },
  { id: 'redo', label: 'action.redo', icon: 'redo', narrow: true, disabled: true },
  { id: 'shortcuts', label: 'action.shortcuts', icon: 'shortcuts' },
  { id: 'new-project', label: 'action.new_project', icon: 'newProject', labelled: true },
];

function ToolButton({ item }: { item: Item }) {
  const name = t(item.label);
  return (
    <button
      type="button"
      class={[
        'tk-tool',
        item.labelled ? 'tk-tool--labelled' : '',
        item.narrow ? 'tk-tool--narrow' : '',
        item.primary ? 'tk-tool--primary' : '',
      ].join(' ')}
      data-action={item.id}
      aria-label={item.labelled ? undefined : name}
      title={item.labelled ? undefined : name}
      disabled={item.disabled}
      aria-disabled={item.id === 'add-media' && !acceptsMedia.value ? 'true' : undefined}
      onClick={item.id === 'add-media' ? addMedia : undefined}
    >
      <Icon name={item.icon} size={20} />
      {item.labelled ? <span class="tk-tool__label">{name}</span> : null}
    </button>
  );
}

export function Toolbar() {
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
        <button type="button" class="tk-tool tk-tool--export" data-action="export" disabled>
          <Icon name="export" size={20} />
          <span class="tk-tool__label">{t('action.export')}</span>
        </button>
      </div>
      {needsClip.value ? <NeedsClip narrow /> : null}
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
