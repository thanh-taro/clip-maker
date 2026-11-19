// MOD-Preview — the preview surface, on-preview editing, text rasterising and editing
// (specs/40-technical/modules/MOD-Preview.md, ADR-0006, ADR-0012). Built in E3: the surface and the
// playback controller (`mountPreview`); full screen (F-002.R7, ./fullscreen.ts). F-006: the placement
// geometry of the on-preview move, handle scale and pinch (./placement.ts). F-010: the text rasteriser
// (./text.ts), the engine's text bitmaps kept in step (./text-sync.ts) and the text move geometry
// (./text-place.ts); the text field is MOD-App's CMP-TextEditor.

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

export {
  BOX_PAD_X,
  LAYOUT_REFERENCE_S,
  bitmapSize,
  bleedOf,
  BOX_PAD_Y,
  LINE_HEIGHT,
  TEXT_FACES,
  canvasMeasure,
  drawText,
  fontOf,
  layoutText,
  rasteriseText,
  rasterKey,
  textBitmaps,
  wrapLines,
  type Measure,
  type TextLayout,
  type TextLine,
} from './text';
export { textSync, type Rasterise, type TextSync } from './text-sync';
export { clampTextSize, moveText, pinchTextSize, textSizeFrom, type TextMoved } from './text-place';
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
