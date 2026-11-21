// MOD-Keys — the RULE-20 History keys F-014 uses: Mod+Z undo; Mod+Shift+Z and Ctrl+Y redo, in scope only.
import { describe, expect, it } from 'vitest';
import { resolveKey, scopeOf, type FocusInfo } from '../../src/keys';

type Ev = Parameters<typeof resolveKey>[0];
const key = (code: string, mods: Partial<Omit<Ev, 'code' | 'key'>> = {}): Ev => ({
  code,
  key: code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const focus = (f: Partial<FocusInfo>): FocusInfo => ({
  tag: 'div',
  role: null,
  type: null,
  editable: false,
  inDialog: false,
  scrollable: false,
  inShortcutArea: true,
  ...f,
});

describe('MOD-Keys history keys (RULE-20, F-014.R1)', () => {
  it('RULE-20 F-014.R1 Mod+Z undoes: Cmd on macOS, Ctrl elsewhere', () => {
    expect(resolveKey(key('KeyZ', { metaKey: true }), 'none', true)).toBe('undo');
    expect(resolveKey(key('KeyZ', { ctrlKey: true }), 'none', false)).toBe('undo');
    expect(resolveKey(key('KeyZ', { ctrlKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyZ', { metaKey: true }), 'none', false)).toBeNull();
    // Plain Z and Alt+Mod+Z are not history keys (Shift+Z fits the timeline, F-013).
    expect(resolveKey(key('KeyZ'), 'none')).toBeNull();
    expect(resolveKey(key('KeyZ', { metaKey: true, altKey: true }), 'none', true)).toBeNull();
  });

  it('RULE-20 F-014.R1 Mod+Shift+Z and Ctrl+Y redo', () => {
    expect(resolveKey(key('KeyZ', { metaKey: true, shiftKey: true }), 'none', true)).toBe('redo');
    expect(resolveKey(key('KeyZ', { ctrlKey: true, shiftKey: true }), 'none', false)).toBe('redo');
    expect(resolveKey(key('KeyY', { ctrlKey: true }), 'none', false)).toBe('redo');
    // RULE-20 writes Ctrl+Y (not Mod+Y): on macOS it is Control+Y; Cmd+Y keeps the browser's meaning.
    expect(resolveKey(key('KeyY', { ctrlKey: true }), 'none', true)).toBe('redo');
    expect(resolveKey(key('KeyY', { metaKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyY', { ctrlKey: true, shiftKey: true }), 'none', false)).toBeNull();
    expect(resolveKey(key('KeyY'), 'none')).toBeNull();
  });

  it('RULE-20 F-014.R1 a held Mod+Z keeps undoing (each repeat is one more step)', () => {
    expect(resolveKey({ ...key('KeyZ', { ctrlKey: true }), repeat: true }, 'none', false)).toBe('undo');
  });

  it('RULE-20 F-014.R1 keys are matched by position, so a non-Latin layout undoes the same', () => {
    expect(resolveKey({ ...key('KeyZ', { ctrlKey: true }), key: 'я' }, 'none', false)).toBe('undo');
  });

  it('RULE-20 while a text or number field is edited the field keeps its own undo; a dialog or menu takes none', () => {
    const field = scopeOf(focus({ tag: 'input', type: 'text', editable: true }), 'KeyZ');
    expect(field).toBe('field');
    expect(resolveKey(key('KeyZ', { ctrlKey: true }), field, false)).toBeNull();
    expect(resolveKey(key('KeyY', { ctrlKey: true }), field, false)).toBeNull();
    const dialog = scopeOf(focus({ inDialog: true }), 'KeyZ');
    expect(resolveKey(key('KeyZ', { metaKey: true }), dialog, true)).toBeNull();
    // A focused button, slider or list does not use Z: the history keys act.
    for (const f of [focus({ tag: 'button' }), focus({ tag: 'input', type: 'range' }), focus({ role: 'listbox' })])
      expect(resolveKey(key('KeyZ', { metaKey: true }), scopeOf(f, 'KeyZ'), true)).toBe('undo');
  });
});
