// MOD-Keys — the RULE-20 keyboard map with scopes (specs/40-technical/modules/MOD-Keys.md).
// Pure core: `scopeOf` says where focus is for a key, `resolveKey` maps a key event in that scope to an
// action. MOD-App's binder executes actions. Built so far: the playback keys (F-002: Space, Left/Right
// with Shift, Home/End) and Esc; the edit, history, view, file and help keys come with F-017.
// Implements: RULE-20 Scope and Playback, F-017.R5 (a focused control that uses a key gets it).

/** Where focus is when a key is pressed (MOD-Keys "Responsibility"). */
export type KeyScope = 'none' | 'field' | 'dialog' | 'control';

/** What a key does (MOD-App dispatches it). */
export type Action =
  | 'play-pause'
  | 'frame-back'
  | 'frame-forward'
  | 'second-back'
  | 'second-forward'
  | 'go-start'
  | 'go-end'
  /** Esc: leaves full screen (CMP-Preview), closes what is open. */
  | 'escape';

/** Mod = Cmd on macOS, else Ctrl (RULE-20). */
export const isMac = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform);

/** The focused element as the scope check needs it (the DOM binder reads it from `activeElement`). */
export interface FocusInfo {
  /** Lower-case tag name. */
  readonly tag: string;
  readonly role: string | null;
  /** An `<input>`'s type. */
  readonly type: string | null;
  /** A text or number field being edited (input, textarea, contenteditable, select). */
  readonly editable: boolean;
  /** Inside an open dialog or menu. */
  readonly inDialog: boolean;
  /** A region that scrolls (its arrow, Space and Page keys scroll it). */
  readonly scrollable: boolean;
}

const BUTTON_ROLES = new Set(['button', 'switch', 'checkbox', 'radio', 'tab', 'menuitem', 'menuitemradio', 'option']);
const BUTTON_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'color']);
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const SCROLL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown']);
/** Composite widgets that move their own selection or focus with the arrows, Space, Page, Home and End. */
const COMPOSITE_ROLES = new Set(['listbox', 'grid', 'tree', 'treegrid', 'option', 'gridcell', 'treeitem', 'row']);
const COMPOSITE_KEYS = new Set([...SLIDER_KEYS, 'Space']);

/**
 * RULE-20 *Scope*: a field being edited, an open dialog or menu, or a focused control that uses this
 * key itself (buttons and toggles get Space and Enter; sliders get the arrows, Home, End and Page keys;
 * lists, grids and trees those and Space; a scrolling region the arrows, Space and Page keys).
 */
export function scopeOf(focus: FocusInfo | null, code: string): KeyScope {
  if (!focus) return 'none';
  if (focus.editable) return 'field';
  if (focus.inDialog) return 'dialog';
  const slider = focus.role === 'slider' || (focus.tag === 'input' && focus.type === 'range');
  if (slider) return SLIDER_KEYS.has(code) ? 'control' : 'none';
  if (focus.role !== null && COMPOSITE_ROLES.has(focus.role)) return COMPOSITE_KEYS.has(code) ? 'control' : 'none';
  if (focus.scrollable && SCROLL_KEYS.has(code)) return 'control';
  const button =
    focus.tag === 'button' ||
    focus.tag === 'summary' ||
    (focus.role !== null && BUTTON_ROLES.has(focus.role)) ||
    (focus.tag === 'input' && focus.type !== null && BUTTON_INPUTS.has(focus.type));
  if (button && (code === 'Space' || code === 'Enter')) return 'control';
  return 'none';
}

/**
 * RULE-20: the action of a key in its scope, or null to keep the browser's default. Keys are matched by
 * position (`code`), so a non-Latin layout acts the same (F-017 edge case).
 */
export function resolveKey(
  event: Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> & {
    readonly repeat?: boolean;
  },
  scope: KeyScope,
): Action | null {
  if (scope === 'field' || scope === 'dialog' || scope === 'control') return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  // A held Space or Esc acts once; held arrows keep stepping.
  if (event.repeat && (event.code === 'Space' || event.code === 'Escape')) return null;
  const shift = event.shiftKey;
  switch (event.code) {
    case 'Space':
      return shift ? null : 'play-pause';
    case 'ArrowLeft':
      return shift ? 'second-back' : 'frame-back';
    case 'ArrowRight':
      return shift ? 'second-forward' : 'frame-forward';
    case 'Home':
      return shift ? null : 'go-start';
    case 'End':
      return shift ? null : 'go-end';
    case 'Escape':
      return shift ? null : 'escape';
    default:
      return null;
  }
}
