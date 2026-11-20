// MOD-Keys — RULE-20 *Scope* for single-character keys (owner decision QA-1, WCAG 2.1.4): letters (with or
// without Shift) and =, +, -, ?, \ act only while focus is on the preview, the timeline or the transport
// controls; Space, the arrows, Home/End, Delete/Backspace, Esc and Mod/Alt combinations keep their scope.
import { describe, expect, it } from 'vitest';
import { isCharacterKey, resolveKey, scopeOf, type FocusInfo } from '../../src/keys';

type Ev = Parameters<typeof resolveKey>[0];
const key = (code: string, mods: Partial<Omit<Ev, 'code'>> = {}): Ev => ({
  code,
  key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code,
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
  ...f,
});

/** Every single-character shortcut of RULE-20 with its action where it acts. */
const CHARACTER_KEYS: readonly [Ev, string][] = [
  [key('KeyS'), 'split'],
  [key('KeyI'), 'set-in'],
  [key('KeyO'), 'set-out'],
  [key('KeyM'), 'mute'],
  [key('KeyT'), 'add-text'],
  [key('KeyN'), 'snapping'],
  [key('KeyZ', { shiftKey: true, key: 'Z' }), 'zoom-fit'],
  [key('Equal', { key: '=' }), 'zoom-in'],
  [key('Equal', { key: '+', shiftKey: true }), 'zoom-in'],
  [key('Minus', { key: '-' }), 'zoom-out'],
  [key('Slash', { key: '?', shiftKey: true }), 'help'],
  [key('Backslash', { key: '\\' }), 'compare'],
];

describe('MOD-Keys single-character scope (RULE-20 Scope, F-017.R6)', () => {
  it('F-017.AC8 MOD-Keys letters, =, -, ? and \\ do nothing with focus off the preview, timeline and transport', () => {
    const elsewhere = [
      null, // no control focused
      focus({ tag: 'button' }), // a toolbar or inspector button
      focus({ tag: 'button', inToolbar: true }),
      focus({ tag: 'section' }),
    ];
    for (const f of elsewhere)
      for (const [ev] of CHARACTER_KEYS) {
        const scope = scopeOf(f, ev.code, ev);
        expect(scope).toBe('outside');
        expect(resolveKey(ev, scope)).toBeNull();
      }
    // A focused inspector slider keeps its keys and gives the letters nothing either.
    const slider = focus({ role: 'slider' });
    expect(resolveKey(key('KeyS'), scopeOf(slider, 'KeyS'))).toBeNull();
  });

  it('F-017.AC8 MOD-Keys the same keys act with focus on the preview, a timeline item, the ruler band or the transport', () => {
    const inside = [
      focus({ tag: 'main', inShortcutArea: true }), // the preview area
      focus({ tag: 'button', timelineItem: true, inShortcutArea: true }),
      focus({ tag: 'button', inShortcutArea: true }), // a transport button
      focus({ tag: 'button', inToolbar: true, inShortcutArea: true }), // the timeline's action toolbar
    ];
    for (const f of inside)
      for (const [ev, action] of CHARACTER_KEYS) expect(resolveKey(ev, scopeOf(f, ev.code, ev))).toBe(action);
  });

  it('RULE-20 MOD-Keys Space, arrows, Home/End, Delete, Esc and Mod/Alt combinations keep their scope off the shortcut area', () => {
    const off = focus({ tag: 'section' });
    const at = (ev: Ev, mac = false) => resolveKey(ev, scopeOf(off, ev.code, ev), mac);
    expect(at(key('Space'))).toBe('play-pause');
    expect(at(key('ArrowRight'))).toBe('frame-forward');
    expect(at(key('ArrowLeft', { shiftKey: true }))).toBe('second-back');
    expect(at(key('Home'))).toBe('go-start');
    expect(at(key('End'))).toBe('go-end');
    expect(at(key('Delete'))).toBe('delete');
    expect(at(key('Backspace'))).toBe('delete');
    expect(at(key('Escape'))).toBe('escape');
    expect(at(key('ArrowLeft', { altKey: true }))).toBe('move-earlier');
    expect(at(key('KeyZ', { metaKey: true }), true)).toBe('undo');
    expect(at(key('KeyZ', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(at(key('KeyY', { ctrlKey: true }))).toBe('redo');
    expect(at(key('KeyB', { ctrlKey: true }))).toBe('split');
    expect(at(key('KeyD', { ctrlKey: true }))).toBe('duplicate');
    expect(at(key('KeyO', { ctrlKey: true }))).toBe('add-media');
    expect(at(key('KeyE', { ctrlKey: true }))).toBe('export');
    expect(at(key('KeyC', { ctrlKey: true }))).toBe('copy-colour');
    expect(at(key('KeyV', { ctrlKey: true }))).toBe('paste-colour');
  });

  it('RULE-20 MOD-Keys a field, a dialog and a control that owns the key still win over the shortcut area', () => {
    expect(scopeOf(focus({ editable: true, inShortcutArea: true }), 'KeyS')).toBe('field');
    expect(scopeOf(focus({ inDialog: true, inShortcutArea: true }), 'KeyS')).toBe('dialog');
    expect(scopeOf(focus({ role: 'slider', inShortcutArea: true }), 'ArrowRight')).toBe('control');
    // The ruler (a slider in the timeline): its arrows are its own, its letters are the timeline's.
    const ruler = focus({ role: 'slider', inShortcutArea: true });
    expect(resolveKey(key('KeyS'), scopeOf(ruler, 'KeyS'))).toBe('split');
    expect(resolveKey(key('Space'), scopeOf(ruler, 'Space'))).toBe('play-pause');
  });

  it('MOD-Keys isCharacterKey: letters with or without Shift and = + - ? \\, never with Mod, Ctrl or Alt', () => {
    expect(isCharacterKey(key('KeyS'))).toBe(true);
    expect(isCharacterKey(key('KeyZ', { shiftKey: true }))).toBe(true);
    expect(isCharacterKey(key('Digit1', { key: '?', shiftKey: true }))).toBe(true);
    expect(isCharacterKey(key('Backslash'))).toBe(true);
    for (const k of ['=', '+', '-']) expect(isCharacterKey(key('Equal', { key: k }))).toBe(true);
    expect(isCharacterKey(key('KeyS', { ctrlKey: true }))).toBe(false);
    expect(isCharacterKey(key('KeyS', { metaKey: true }))).toBe(false);
    expect(isCharacterKey(key('KeyS', { altKey: true }))).toBe(false);
    for (const code of ['Space', 'ArrowLeft', 'Home', 'Delete', 'Backspace', 'Escape', 'Enter', 'Tab'])
      expect(isCharacterKey(key(code))).toBe(false);
  });
});
