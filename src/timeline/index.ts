// MOD-Timeline — the main track, text lane and audio track view with pointer and touch input
// (specs/40-technical/modules/MOD-Timeline.md, RULE-14, RULE-21). An imperative view: pointer moves
// and scrubbing never re-render Preact (ADR-0002 §1). Built with F-003: the ruler, playhead and main
// track (./view.ts) on pure geometry (./geometry.ts). Zoom and scroll come with F-013, the touch
// playhead with F-017. F-004 adds the trim handles (./view.ts) and the item spans and snapping (./geometry.ts).
import { notImplemented } from '../core';

export {
  mountTimeline,
  HOLD_MS,
  type TimelineDeps,
  type TimelineSignals,
  type TimelineView,
  type TrimDrag,
  type CrossFadeDeps,
} from './view';
export { itemSpan, type ItemSpan } from './geometry';
export const zoomIn = (): void => notImplemented('MOD-Timeline zoomIn');
export const zoomOut = (): void => notImplemented('MOD-Timeline zoomOut');
export const fit = (): void => notImplemented('MOD-Timeline fit');
export const scrollToPlayhead = (): void => notImplemented('MOD-Timeline scrollToPlayhead');
