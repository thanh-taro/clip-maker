// MOD-Core — domain types and every rule's maths, pure (specs/40-technical/modules/MOD-Core.md).
// Imports no DOM, worker, codec or GPU API (lint-enforced). Holds the generated types, palette and
// look IDs, the thread protocol, frame-time maths and the rule maths that MOD-Project composes.

export type * from './project.gen';
export { PALETTE, PALETTE_HEX, type PaletteName } from './palette.gen';
export {
  DUOTONE_PAIR_COLOURS,
  DUOTONE_PAIRS,
  LOOK_GROUPS,
  LOOK_IDS,
  LOOKS,
  type DuotonePairId,
  type LookGroup,
  type LookId,
} from './looks.gen';
export * from './messages';
export type * from './engine-protocol';
export type * from './sound-feed';
export { NotImplementedError, notImplemented } from './stub';
export * from './time';
export * from './limits';
export * from './notices';
export * from './timing';
export * from './audio';
export * from './text';
export * from './visual';
// The colour tools' maths and settings (RULE-24, D-053, ADR-0017).
export * from './colour';
export * from './colour-tools';
export * from './source-end';
export * from './edits';
export * from './check';
export * from './media';

// Export tables, rate control, file names and GIF timing (RULE-15, RULE-16, ADR-0010).
export * from './export';
export type * from './export-protocol';

// The Trusted Types policy for worker and service-worker script URLs (ADR-0014, QA-3).
export { ownScriptUrl, scriptUrl, TRUSTED_TYPES_POLICY, resetTrustedTypesForTests } from './trusted-types';
