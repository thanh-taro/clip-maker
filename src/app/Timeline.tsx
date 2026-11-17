// MOD-App — CMP-Timeline's chrome (specs/30-experience/components/CMP-Timeline.md; board CMP-Timeline):
// the region named COPY-timeline.label, its action toolbar on wide and compact layouts, and the lane
// gutter; MOD-Timeline draws the ruler, playhead and main track imperatively inside (ADR-0002 §1).
// Built with F-003: Delete, Duplicate, Move earlier and Move later (text-and-icon buttons, unavailable
// with readable muted labels while nothing is selected). Snapping
// and zoom (F-013) join the toolbar with their feature. On narrow layouts the actions live in the Edit
// sheet (./EditSheet.tsx) and the toolbar is hidden.
// F-011: the audio lane's gutter icon and its items' names; with an audio clip selected the move actions
// read Earlier and Later (COPY-action.time_earlier, COPY-action.time_later) and move it one frame in time
// (CMP-Timeline "audio item").
// F-004: Split, Start here and End here lead the toolbar (CMP-Timeline "wide / default"), then a divider;
// the view's trim handles drag through ./trim.ts with the readout COPY-timeline.length · COPY-timeline.ends_at.
// Implements: F-004.R1–R4, F-004.R6 (visible controls that trim at the playhead), RULE-21 (trim drag →
// start-here and end-here controls).
// Implements: F-003.R1 (selection shown on the timeline), F-003.R6 (visible controls), F-003.AC5,
// RULE-20 arrange keys (bound while the timeline is mounted), RULE-21 (move-earlier/later stand in for
// hold-and-drag; time controls for audio clips), F-011.R2, F-011.R8.
// F-009: the view's cross-fade controls at each join (the add chip, the bow-tie marker) act through
// ./fades.ts; the marker's popover is ./CrossFadePopover.tsx. The phone Edit sheet's Cross-fade tile is
// CROSSFADE_ITEM. Implements: F-009.R2, F-009.R7, CMP-Timeline "cross-fade".
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, t } from '../copy';
import { CrossFadePopover } from './CrossFadePopover';
import { addCrossFade, crossFadeTile, joinOf, openJoin, secondsLabel, tileJoin } from './fades';
import { registry } from '../media';
import { isEmpty, playhead, project, selection } from '../project';
import { mountTimeline, type TimelineView } from '../timeline';
import { beginTrim, splitHere, trimAvailable, trimHere } from './trim';
import { MUSIC_TRACKS } from '../core';
import {
  arrangeAvailable,
  bindArrangeKeys,
  deleteSelected,
  duplicateSelected,
  moveAudioTo,
  moveClipTo,
  moveSelected,
  onDeleted,
  selectClip,
  selectedAudio,
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

type ArrangeLabel =
  | 'action.split'
  | 'action.set_in'
  | 'action.set_out'
  | 'action.delete'
  | 'action.duplicate'
  | 'action.move_left'
  | 'action.move_right'
  | 'action.time_earlier'
  | 'action.time_later'
  | 'action.add_crossfade';

export interface ArrangeItem {
  readonly id: 'split' | 'set-in' | 'set-out' | 'delete' | 'duplicate' | 'move-earlier' | 'move-later' | 'cross-fade';
  readonly label: ArrangeLabel;
  /** The label for the current selection (an audio clip's moves are Earlier and Later in time). */
  readonly labelNow?: () => ArrangeLabel;
  readonly icon: IconName;
  readonly run: () => boolean;
  readonly available: () => boolean;
  /**
   * Why an unavailable control is unavailable (F-009.R7), shown with it; activating it then shows the reason
   * as a notice (`run` does).
   */
  readonly reason?: () => string | null;
}

/**
 * F-009 (CMP-Timeline "narrow / sheet open"): the phone Edit sheet's Cross-fade tile acts on the join after
 * the selected clip: it adds a 0.5 s cross-fade and opens its popover, or opens the popover of the one there.
 * Unavailable without a next clip, or with COPY-notice.crossfade_too_short between clips too short.
 */
export const CROSSFADE_ITEM: ArrangeItem = {
  id: 'cross-fade',
  label: 'action.add_crossfade',
  icon: 'crossFade',
  run: crossFadeTile,
  available: () => tileJoin.value?.available === true,
  reason: () => {
    const r = tileJoin.value?.reason;
    return r === 'notice.crossfade_too_short' ? t(r) : null;
  },
};

/** F-004.R2/R6: Split, Start here and End here as visible controls (the toolbar here, the phone Edit sheet). */
export const TRIM_ITEMS: readonly ArrangeItem[] = [
  {
    id: 'split',
    label: 'action.split',
    icon: 'split',
    run: splitHere,
    available: () => trimAvailable.value.split,
  },
  {
    id: 'set-in',
    label: 'action.set_in',
    icon: 'setIn',
    run: () => trimHere('start'),
    available: () => trimAvailable.value.setIn,
  },
  {
    id: 'set-out',
    label: 'action.set_out',
    icon: 'setOut',
    run: () => trimHere('end'),
    available: () => trimAvailable.value.setOut,
  },
];

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
    labelNow: () => (selectedAudio.value ? 'action.time_earlier' : 'action.move_left'),
    icon: 'moveEarlier',
    run: () => moveSelected('earlier'),
    available: () => arrangeAvailable.value.earlier,
  },
  {
    id: 'move-later',
    label: 'action.move_right',
    labelNow: () => (selectedAudio.value ? 'action.time_later' : 'action.move_right'),
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
      <span>{t(item.labelNow?.() ?? item.label)}</span>
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
        trackLabel: () => t('timeline.main_track'),
        picture: async (sourceId) => {
          const entry = await registry.load(sourceId);
          return entry?.thumbnail ?? entry?.bitmap ?? null;
        },
        audioName: (a) => {
          const p = project.peek();
          return (
            p.sources.find((s) => s.id === a.sourceId)?.name ??
            MUSIC_TRACKS.find((m) => m.id === a.sourceId)?.title ??
            ''
          );
        },
        select: selectClip,
        move: (id, to) => void moveClipTo(id, to),
        moveAudio: (id, start) => void moveAudioTo(id, start),
        scrubStart: pauseForScrub,
        trim: beginTrim,
        trimReadout: (length, end) => [
          t('timeline.length', { length: formatDuration(length) }),
          t('timeline.ends_at', { time: formatDuration(end) }),
        ],
        crossFade: {
          join: (p, id) => {
            const j = joinOf(p, id);
            const on = (j?.tenths ?? 0) > 0;
            return {
              on,
              // The marker is named by the popover it opens and the length; the chip by its action.
              label: on ? `${t('crossfade.length')} ${secondsLabel(j!.tenths)}` : t('action.add_crossfade'),
              reason: j?.reason === 'notice.crossfade_too_short' ? t(j.reason) : null,
            };
          },
          open: openJoin,
          add: (id) => void addCrossFade(id),
          toggle: (id) => (openJoin.value = openJoin.peek() === id ? null : id),
        },
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
        {TRIM_ITEMS.map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
        <span class="tk-tl-toolbar__divider" aria-hidden="true" />
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
          <Icon name="audio" size={16} class="tk-tl-gutter__audio" />
        </div>
        <div class="tk-tl-lanes" ref={lanes} />
      </div>
      <CrossFadePopover />
    </section>
  );
}
