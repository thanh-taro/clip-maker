// MOD-Preview — the preview surface, on-preview editing, text rasterising and editing
// (specs/40-technical/modules/MOD-Preview.md, ADR-0006, ADR-0012). Phase 3.3 scaffold: the public
// surface; built with F-002, F-006, F-007.R7, F-010 and F-017.
import { notImplemented, type TextLayer } from '../core';

export const mountPreview = (_element: HTMLElement): never => notImplemented('MOD-Preview mountPreview');
export const rasteriseText = (_layer: TextLayer, _scale: number): Promise<ImageBitmap> =>
  notImplemented('MOD-Preview rasteriseText');
export const enterFullscreen = (): Promise<void> => notImplemented('MOD-Preview enterFullscreen');
