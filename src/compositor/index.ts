// MOD-Compositor — the one WebGL2 `paint` for preview, thumbnails and exports
// (specs/40-technical/modules/MOD-Compositor.md, ADR-0006, ADR-0007). Never reads language, theme or
// view state (INV-05). Phase 3.3 scaffold: the public surface; built with F-002 and F-006 … F-012.
import { notImplemented } from '../core';
import type { FramePlan } from '../plan';

export interface Compositor {
  paint(plan: FramePlan, frames: unknown, textBitmaps: unknown): void;
  resize(width: number, height: number): void;
}

export const createCompositor = (_canvas: OffscreenCanvas, _looks: unknown): Compositor =>
  notImplemented('MOD-Compositor createCompositor');
export const effectsCheck = (): Promise<{ ok: boolean; fps: number; slow: boolean }> =>
  notImplemented('MOD-Compositor effectsCheck');
