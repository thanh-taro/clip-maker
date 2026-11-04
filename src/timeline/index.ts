// MOD-Timeline — the main track, text lane and audio track view with pointer and touch input
// (specs/40-technical/modules/MOD-Timeline.md, RULE-14, RULE-21). An imperative canvas: pointer moves
// and scrubbing never re-render Preact (ADR-0002 §1). Phase 3.3 scaffold: the public surface; built
// with F-003, F-004, F-013 and F-017.
import { notImplemented } from '../core';

export const mountTimeline = (_element: HTMLElement): never => notImplemented('MOD-Timeline mountTimeline');
export const zoomIn = (): void => notImplemented('MOD-Timeline zoomIn');
export const zoomOut = (): void => notImplemented('MOD-Timeline zoomOut');
export const fit = (): void => notImplemented('MOD-Timeline fit');
export const scrollToPlayhead = (): void => notImplemented('MOD-Timeline scrollToPlayhead');
