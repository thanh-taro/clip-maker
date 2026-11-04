// MOD-Keys — the RULE-20 keyboard map with scopes (specs/40-technical/modules/MOD-Keys.md).
// Pure core plus a small DOM binder. Phase 3.3 scaffold: the scope type and the public surface;
// the map is built with F-017.
import { notImplemented } from '../core';

/** Where focus is when a key is pressed (MOD-Keys "Responsibility"). */
export type KeyScope = 'none' | 'field' | 'dialog' | 'control';

/** Mod = Cmd on macOS, else Ctrl (RULE-20). */
export const isMac = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform);

export const resolveKey = (
  _event: Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  _scope: KeyScope,
): string | null => notImplemented('MOD-Keys resolveKey');
