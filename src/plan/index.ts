// MOD-Plan — what to draw and play at any project time, pure (specs/40-technical/modules/MOD-Plan.md,
// INV-02). Imports only MOD-Core and no DOM. Phase 3.3 scaffold: the public surface; the recipe is
// built with F-002 (frames), F-009 (weights), F-010 (text), F-011 (sound) and F-016 (GIF).
import { notImplemented, type Project } from '../core';

/** The recipe for one output frame (shape defined with F-002). */
export interface FramePlan {
  readonly frameIndex: number;
}
/** The recipe for a block of 48 kHz sound (shape defined with F-002 / F-011). */
export interface AudioPlan {
  readonly fromSample: number;
  readonly count: number;
}

/** Mixing rate of every audio plan (architecture.md A4). */
export const SAMPLE_RATE = 48_000;

export const framePlan = (_project: Project, _frameIndex: number): FramePlan => notImplemented('MOD-Plan framePlan');
export const audioPlan = (_project: Project, _fromSample: number, _count: number): AudioPlan =>
  notImplemented('MOD-Plan audioPlan');
export const gifFramePlan = (_project: Project, _settings: unknown, _i: number): FramePlan =>
  notImplemented('MOD-Plan gifFramePlan');
export const thumbnailPlan = (_project: Project, _clipId: string, _lookId?: string): FramePlan =>
  notImplemented('MOD-Plan thumbnailPlan');
