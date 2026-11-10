// MOD-App — CMP-Timeline's chrome (specs/30-experience/components/CMP-Timeline.md; board CMP-Timeline):
// the region named COPY-timeline.label, its action toolbar on wide and compact layouts, and the lane
// gutter; MOD-Timeline draws the ruler, playhead and main track imperatively inside (ADR-0002 §1).
// Built with F-003: Delete, Duplicate, Move earlier and Move later (text-and-icon buttons, unavailable
// with readable muted labels while nothing is selected). Split, Start here and End here (F-004), snapping
// and zoom (F-013) join the toolbar with their features. On narrow layouts the actions live in the Edit
// sheet (./EditSheet.tsx) and the toolbar is hidden.
// Implements: F-003.R1 (selection shown on the timeline), F-003.R6 (visible controls), F-003.AC5,
// RULE-20 arrange keys (bound while the timeline is mounted), RULE-21 (move-earlier/later stand in for
// hold-and-drag).
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { registry } from '../media';
import { isEmpty, playhead, project, selection } from '../project';
import { mountTimeline, type TimelineView } from '../timeline';
import {
  arrangeAvailable,
  bindArrangeKeys,
  deleteSelected,
  duplicateSelected,
  moveClipTo,
  moveSelected,
  onDeleted,
  selectClip,
} from './arrange';
import { Icon, type IconName } from './icons';
import { pauseForScrub } from './playback';

/** The timeline view of the session (for focus after a delete). */
let view: TimelineView | null = null;

/** After a delete, keyboard focus stays on the track when the control that had it is gone or unavailable. */
function keepFocus(index: number): void {
  setTimeout(() => {
    const active = document.activeElement as HTMLButtonElement | null;
    if (!active || active === document.body || !active.isConnected || active.disabled) view?.focusClip(index);
  }, 0);
}

export interface ArrangeItem {
  readonly id: 'delete' | 'duplicate' | 'move-earlier' | 'move-later';
  readonly label: 'action.delete' | 'action.duplicate' | 'action.move_left' | 'action.move_right';
  readonly icon: IconName;
  readonly run: () => boolean;
  readonly available: () => boolean;
}

/** F-003.R6: the four arrange actions as visible controls (the toolbar here, the phone Edit sheet). */
export const ARRANGE_ITEMS: readonly ArrangeItem[] = [
  {
    id: 'delete',
    label: 'action.delete',
    icon: 'trash',
    run: deleteSelected,
    available: () => arrangeAvailable.value.delete,
  },
  {
    id: 'duplicate',
    label: 'action.duplicate',
    icon: 'duplicate',
    run: duplicateSelected,
    available: () => arrangeAvailable.value.duplicate,
  },
  {
    id: 'move-earlier',
    label: 'action.move_left',
    icon: 'moveEarlier',
    run: () => moveSelected('earlier'),
    available: () => arrangeAvailable.value.earlier,
  },
  {
    id: 'move-later',
    label: 'action.move_right',
    icon: 'moveLater',
    run: () => moveSelected('later'),
    available: () => arrangeAvailable.value.later,
  },
];

function ToolbarButton({ item }: { item: ArrangeItem }) {
  const available = item.available();
  return (
    <button
      type="button"
      class="tk-tl-tool"
      data-action={item.id}
      // Unavailable actions keep readable muted labels (CMP-Timeline "wide / default").
      aria-disabled={available ? undefined : 'true'}
      onClick={() => {
        if (item.available()) item.run();
      }}
    >
      <Icon name={item.icon} size={16} />
      <span>{t(item.label)}</span>
    </button>
  );
}

export function Timeline() {
  const empty = isEmpty.value;
  const lanes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = lanes.current;
    if (!host) return undefined;
    view = mountTimeline(
      host,
      { project, selection, playhead },
      {
        name: (clip) => project.peek().sources.find((s) => s.id === clip.sourceId)?.name ?? '',
        time: (us) => formatDuration(us),
        endLabel: () => t('timeline.project_end'),
        emptyHint: () => t('drop.hint'),
        picture: async (sourceId) => {
          const entry = await registry.load(sourceId);
          return entry?.thumbnail ?? entry?.bitmap ?? null;
        },
        select: selectClip,
        move: (id, to) => void moveClipTo(id, to),
        scrubStart: pauseForScrub,
      },
    );
    onDeleted(keepFocus);
    const unbind = bindArrangeKeys();
    return () => {
      unbind();
      onDeleted(null);
      view?.dispose();
      view = null;
    };
  }, []);

  return (
    <section class="tk-timeline" aria-label={t('timeline.label')} data-unavailable={empty ? '' : undefined}>
      <div class="tk-tl-toolbar" role="toolbar" aria-label={t('timeline.label')}>
        {ARRANGE_ITEMS.slice(0, 2).map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
        <span class="tk-tl-toolbar__divider" aria-hidden="true" />
        {ARRANGE_ITEMS.slice(2).map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
      </div>
      <div class="tk-tl-body">
        <div class="tk-tl-gutter" aria-hidden="true">
          <Icon name="film" size={16} />
        </div>
        <div class="tk-tl-lanes" ref={lanes} />
      </div>
    </section>
  );
}
