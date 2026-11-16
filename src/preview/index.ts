// MOD-Preview — the preview surface, on-preview editing, text rasterising and editing
// (specs/40-technical/modules/MOD-Preview.md, ADR-0006, ADR-0012). Built in E3: the surface and the
// playback controller (`mountPreview`); full screen (F-002.R7, ./fullscreen.ts). F-006: the placement
// geometry of the on-preview move, handle scale and pinch (./placement.ts). Text gestures (F-010, F-017)
// and text rasterising (F-010) come with their features.
import { notImplemented, type TextLayer } from '../core';

export {
  mountPreview,
  browserPreviewEnv,
  type EnginePort,
  type PlayState,
  type PreviewClock,
  type PreviewController,
  type PreviewDeps,
  type PreviewEnv,
  type PreviewSignals,
} from './controller';
export { clampTime, pausedAt, playFrom, previewSize, stepTime, PREVIEW_MAX_SHORT } from './timing';

export const rasteriseText = (_layer: TextLayer, _scale: number): Promise<ImageBitmap> =>
  notImplemented('MOD-Preview rasteriseText');
export { enterFullscreen, fullscreen, type Fullscreen, type FullscreenDoc, type FullscreenMode } from './fullscreen';
export {
  HANDLES,
  handlePoints,
  moveFrom,
  pinchScale,
  roundOffset,
  scaleFrom,
  screenRect,
  type Handle,
  type Moved,
  type Point,
  type Rect,
  type Size,
} from './placement';
