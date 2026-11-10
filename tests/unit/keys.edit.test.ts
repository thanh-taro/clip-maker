// MOD-Keys — the RULE-20 edit keys F-003 uses: Delete or Backspace, Mod+D, Alt+Left/Right, in scope only.
import { describe, expect, it } from 'vitest';
import { isMac, resolveKey, scopeOf, type FocusInfo } from '../../src/keys';

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
  ...f,
});

describe('MOD-Keys edit keys (RULE-20, F-003.R6)', () => {
  it('RULE-20 Delete or Backspace deletes the selection', () => {
    expect(resolveKey(key('Delete'), 'none')).toBe('delete');
    expect(resolveKey(key('Backspace'), 'none')).toBe('delete');
    expect(resolveKey(key('Backspace', { metaKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('Delete', { shiftKey: true }), 'none')).toBeNull();
  });

  it('RULE-20 Mod+D duplicates: Cmd on macOS, Ctrl elsewhere', () => {
    expect(resolveKey(key('KeyD', { metaKey: true }), 'none', true)).toBe('duplicate');
    expect(resolveKey(key('KeyD', { ctrlKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyD', { ctrlKey: true }), 'none', false)).toBe('duplicate');
    expect(resolveKey(key('KeyD', { metaKey: true }), 'none', false)).toBeNull();
    expect(resolveKey(key('KeyD'), 'none')).toBeNull();
    expect(isMac('MacIntel')).toBe(true);
    expect(isMac('Win32')).toBe(false);
  });

  it('RULE-20 Alt+Left / Alt+Right move the selected clip one place earlier / later', () => {
    expect(resolveKey(key('ArrowLeft', { altKey: true }), 'none')).toBe('move-earlier');
    expect(resolveKey(key('ArrowRight', { altKey: true }), 'none')).toBe('move-later');
    // Plain arrows stay frame steps (F-002); Shift+Alt is the 1 s time move of text and audio (F-010, F-011).
    expect(resolveKey(key('ArrowLeft'), 'none')).toBe('frame-back');
    expect(resolveKey(key('ArrowLeft', { altKey: true, shiftKey: true }), 'none')).toBeNull();
  });

  it('RULE-20 edit keys act only in scope: never while a field is edited, a dialog is open or a slider has focus', () => {
    for (const scope of ['field', 'dialog', 'control'] as const) {
      expect(resolveKey(key('Backspace'), scope)).toBeNull();
      expect(resolveKey(key('KeyD', { ctrlKey: true }), scope)).toBeNull();
      expect(resolveKey(key('ArrowLeft', { altKey: true }), scope)).toBeNull();
    }
    expect(scopeOf(focus({ tag: 'input', type: 'text', editable: true }), 'Backspace')).toBe('field');
    expect(scopeOf(focus({ tag: 'input', type: 'range' }), 'ArrowLeft')).toBe('control');
    // A focused clip on the timeline is a button: Delete and Alt+arrows reach the tool.
    expect(scopeOf(focus({ tag: 'button' }), 'Delete')).toBe('none');
    expect(scopeOf(focus({ tag: 'button' }), 'ArrowLeft')).toBe('none');
  });
});
