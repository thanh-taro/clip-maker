// MOD-Core — domain types and every rule's maths, pure (specs/40-technical/modules/MOD-Core.md).
// Imports no DOM, worker, codec or GPU API (lint-enforced). Phase 3.3 scaffold: the generated types,
// palette and look IDs, the thread protocol, and the public surface whose maths phase 4 builds.
import { notImplemented } from './stub';
import type { Frame } from './project.gen';

export type * from './project.gen';
export { PALETTE, PALETTE_HEX, type PaletteName } from './palette.gen';
export { LOOK_GROUPS, LOOK_IDS, LOOKS, type LookGroup, type LookId } from './looks.gen';
export * from './messages';
export { NotImplementedError, notImplemented } from './stub';

/** Integer microseconds: every time in the project (project.schema.json, rules.md "Frame times"). */
export type Micros = number;
/** A project frame rate (RULE-04). */
export type FrameRate = Frame['frameRate'];

// Time ("Frame times" in rules.md) — built with F-002/F-003.
export const frameStart = (_k: number, _rate: FrameRate): Micros => notImplemented('MOD-Core frameStart');
export const snapToFrame = (_t: Micros, _rate: FrameRate): Micros => notImplemented('MOD-Core snapToFrame');
export const framesOf = (_d: Micros, _rate: FrameRate): number => notImplemented('MOD-Core framesOf');
export const minDuration = (_rate: FrameRate): Micros => notImplemented('MOD-Core minDuration');

// Export tables (RULE-15, architecture.md "Export tables") — built with F-015.
export const bitrateFor = (_resolution: number, _quality: string, _rate: FrameRate): number =>
  notImplemented('MOD-Core bitrateFor');
export const floorFor = (_resolution: number, _rate: FrameRate): number => notImplemented('MOD-Core floorFor');

// Files (RULE-01, RULE-15) — built with F-001 and F-015.
export const sniff = (_bytes: Uint8Array): string | null => notImplemented('MOD-Core sniff');
export const exportFileName = (_date: Date, _ext: string): string => notImplemented('MOD-Core exportFileName');
