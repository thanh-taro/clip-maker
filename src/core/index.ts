// MOD-Core — domain types and every rule's maths, pure (specs/40-technical/modules/MOD-Core.md).
// Imports no DOM, worker, codec or GPU API (lint-enforced). Holds the generated types, palette and
// look IDs, the thread protocol, frame-time maths and the rule maths that MOD-Project composes.
import { notImplemented } from './stub';
import type { FrameRate } from './time';

export type * from './project.gen';
export { PALETTE, PALETTE_HEX, type PaletteName } from './palette.gen';
export { LOOK_GROUPS, LOOK_IDS, LOOKS, type LookGroup, type LookId } from './looks.gen';
export * from './messages';
export { NotImplementedError, notImplemented } from './stub';
export * from './time';
export * from './limits';
export * from './notices';
export * from './timing';
export * from './audio';
export * from './text';
export * from './visual';
export * from './music';
export * from './edits';
export * from './check';
export * from './media';

// Export tables (RULE-15, architecture.md "Export tables") — built with F-015.
export const bitrateFor = (_resolution: number, _quality: string, _rate: FrameRate): number =>
  notImplemented('MOD-Core bitrateFor');
export const floorFor = (_resolution: number, _rate: FrameRate): number => notImplemented('MOD-Core floorFor');

// Files (RULE-15) — built with F-015. Sniffing (RULE-01) is in ./media.
export const exportFileName = (_date: Date, _ext: string): string => notImplemented('MOD-Core exportFileName');
