// MOD-App — the timeline's view settings (F-013): RULE-14 snapping (on by default, for both the timeline and
// the preview) and the zoom the user chose. Both are UI state of the page, kept across New project (RULE-23),
// not project data and not undo steps. MOD-Timeline reads them through its signals; CMP-Preview's placement and
// text overlays read `snapping` for their snap guides (F-006, F-010).
// Implements: F-013.R1 (the zoom kept for the session), F-013.R3 (one toggle for the timeline and the preview),
// RULE-23 (snapping and timeline zoom are kept).
import { computed, signal } from '@preact/signals';
import type { TimelineNav, TimelineView } from '../timeline';

/** RULE-14: snapping, on by default; COPY-action.snapping toggles it for the timeline and the preview. */
export const snapping = signal(true);

/** F-013.R1: the chosen zoom in pixels per microsecond, or null to fit the whole project. */
export const timelineZoom = signal<number | null>(null);

/** The mounted timeline view (MOD-Timeline), for the zoom controls. */
export const timelineView = signal<TimelineView | null>(null);

const NO_NAV: TimelineNav = { canZoomIn: false, canZoomOut: false, framePx: null, centred: false };

/** The zoom controls' state (CMP-Timeline toolbar and the narrow zoom pill). */
export const timelineNav = computed<TimelineNav>(() => timelineView.value?.nav.value ?? NO_NAV);

/** COPY-action.snapping: turn snapping on or off. */
export function toggleSnapping(): void {
  snapping.value = !snapping.peek();
}
