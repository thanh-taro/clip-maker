// MOD-Scratch — the only on-device storage, used during export only
// (specs/40-technical/modules/MOD-Scratch.md, ADR-0010). The only module allowed to touch
// `navigator.storage` / the origin-private file system (lint-enforced). Phase 3.3 scaffold: the
// public surface; built with F-015.R7 (sweep, 10 s rule, Web Lock per session). It depends on no
// other module (depends_on: []).

const notImplemented = (what: string): never => {
  throw new Error(`not implemented yet: ${what}`);
};

/** Scratch file names (ADR-0010 outcome item 6): `scratch/export-<session>-<random>.part`. */
export const SCRATCH_DIR = 'scratch';
/** The Web Lock this session holds for the page's life. */
export const lockName = (session: string): string => `clipmaker-scratch:${session}`;

export const hasRoom = (_bytes: number): Promise<boolean> => notImplemented('MOD-Scratch hasRoom');
export const create = (): never => notImplemented('MOD-Scratch create');
export const sweep = (): Promise<void> => notImplemented('MOD-Scratch sweep');
