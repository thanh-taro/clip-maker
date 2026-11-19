// MOD-Timeline — the main track, text lane and audio track view with pointer and touch input
// (specs/40-technical/modules/MOD-Timeline.md, RULE-14, RULE-21). An imperative view: pointer moves
// and scrubbing never re-render Preact (ADR-0002 §1). Built with F-003: the ruler, playhead and main
// track (./view.ts) on pure geometry (./geometry.ts). F-004 adds the trim handles (./view.ts) and the item
// spans and snapping (./geometry.ts). F-013 adds zoom, scroll, following the playhead, the centre-fixed
// playhead of narrow layouts (D-013) and the snapping toggle: the commands are the mounted view's
// (`zoomIn`, `zoomOut`, `fit`, `scrollToPlayhead`, and `nav` for the controls' state).

export {
  mountTimeline,
  HOLD_MS,
  type TimelineDeps,
  type TimelineSignals,
  type TimelineView,
  type TimelineNav,
  type TrimDrag,
  type CrossFadeDeps,
} from './view';
export { itemSpan, type ItemSpan } from './geometry';
