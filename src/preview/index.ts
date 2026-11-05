// MOD-Preview — the preview surface, on-preview editing, text rasterising and editing
// (specs/40-technical/modules/MOD-Preview.md, ADR-0006, ADR-0012). Built in E3: the surface and the
// playback controller (`mountPreview`). On-preview gestures (F-006, F-017), text rasterising (F-010)
// and full screen (F-002.R7) come with their features.
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
export const enterFullscreen = (): Promise<void> => notImplemented('MOD-Preview enterFullscreen');
