// MOD-Timeline — the main track, text lane and audio track view with pointer and touch input
// (specs/40-technical/modules/MOD-Timeline.md, RULE-14, RULE-21). An imperative view: pointer moves
// and scrubbing never re-render Preact (ADR-0002 §1). Built with F-003: the ruler, playhead and main
// track (./view.ts) on pure geometry (./geometry.ts). Zoom and scroll come with F-013, the touch
// playhead with F-017, trim handles with F-004.
import { notImplemented } from '../core';

export { mountTimeline, HOLD_MS, type TimelineDeps, type TimelineSignals, type TimelineView } from './view';
export const zoomIn = (): void => notImplemented('MOD-Timeline zoomIn');
export const zoomOut = (): void => notImplemented('MOD-Timeline zoomOut');
export const fit = (): void => notImplemented('MOD-Timeline fit');
export const scrollToPlayhead = (): void => notImplemented('MOD-Timeline scrollToPlayhead');
