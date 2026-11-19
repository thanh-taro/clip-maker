// MOD-Keys — the RULE-20 playback keys and their scopes (F-002.R2/R4 by keyboard). The rest of the map
// comes with F-017.
import { describe, expect, it } from 'vitest';
import { resolveKey, scopeOf, type FocusInfo } from '../../src/keys';

type Ev = Parameters<typeof resolveKey>[0];
const key = (code: string, mods: Partial<Omit<Ev, 'code' | 'key'>> = {}): Ev => ({
  code,
  key: code === 'Space' ? ' ' : code,
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

describe('MOD-Keys playback keys (RULE-20)', () => {
  it('RULE-20 Space plays and pauses; Left/Right move one frame, Shift one second; Home/End go to the start/end', () => {
    expect(resolveKey(key('Space'), 'none')).toBe('play-pause');
    expect(resolveKey(key('ArrowLeft'), 'none')).toBe('frame-back');
    expect(resolveKey(key('ArrowRight'), 'none')).toBe('frame-forward');
    expect(resolveKey(key('ArrowLeft', { shiftKey: true }), 'none')).toBe('second-back');
    expect(resolveKey(key('ArrowRight', { shiftKey: true }), 'none')).toBe('second-forward');
    expect(resolveKey(key('Home'), 'none')).toBe('go-start');
    expect(resolveKey(key('End'), 'none')).toBe('go-end');
    expect(resolveKey(key('Escape'), 'none')).toBe('escape');
  });

  it('RULE-20 keys with Mod or Alt are not playback keys (Alt+Left moves an item, keys.edit.test.ts)', () => {
    expect(resolveKey(key('Space', { ctrlKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('ArrowLeft', { altKey: true }), 'none')).not.toBe('frame-back');
    expect(resolveKey(key('ArrowRight', { metaKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('Home', { shiftKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('KeyQ'), 'none')).toBeNull();
  });

  it('RULE-20 while a field is edited or a dialog is open, playback keys keep the browser default', () => {
    for (const scope of ['field', 'dialog', 'control'] as const) {
      expect(resolveKey(key('Space'), scope)).toBeNull();
      expect(resolveKey(key('ArrowRight'), scope)).toBeNull();
      expect(resolveKey(key('Home'), scope)).toBeNull();
    }
  });

  it('RULE-20 a focused control that uses a key gets it: buttons Space and Enter, sliders the arrows, Home, End and Page keys', () => {
    const button = focus({ tag: 'button' });
    expect(scopeOf(button, 'Space')).toBe('control');
    expect(scopeOf(button, 'Enter')).toBe('control');
    expect(scopeOf(button, 'ArrowRight')).toBe('none');
    expect(scopeOf(focus({ role: 'switch' }), 'Space')).toBe('control');
    expect(scopeOf(focus({ tag: 'input', type: 'checkbox' }), 'Space')).toBe('control');
    const slider = focus({ tag: 'input', type: 'range' });
    for (const code of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])
      expect(scopeOf(slider, code)).toBe('control');
    expect(scopeOf(slider, 'Space')).toBe('none');
    expect(scopeOf(focus({ role: 'slider' }), 'Home')).toBe('control');
    // Nothing focused (the body) or a plain region: the tool's keys.
    expect(scopeOf(null, 'Space')).toBe('none');
    expect(scopeOf(focus({ tag: 'main' }), 'Space')).toBe('none');
  });

  it('RULE-20 Q105 the compact inspector’s focused resize grip (a separator) gets the arrows, Home and End', () => {
    const grip = focus({ role: 'separator' });
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])
      expect(scopeOf(grip, code)).toBe('control');
    expect(scopeOf(grip, 'Space')).toBe('none');
  });

  it('RULE-20 a focused radio (CMP-Inspector option groups: aspect, rate, background) keeps the arrows, Space and Enter', () => {
    const radio = focus({ tag: 'button', role: 'radio' });
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'])
      expect(scopeOf(radio, code)).toBe('control');
    // Home and End still go to the project start and end (a radio group has no use for them).
    expect(scopeOf(radio, 'Home')).toBe('none');
    expect(scopeOf(focus({ tag: 'input', type: 'radio' }), 'ArrowDown')).toBe('control');
  });

  it('RULE-20 a text or number field being edited, and an open dialog, are their own scopes', () => {
    expect(scopeOf(focus({ tag: 'input', type: 'text', editable: true }), 'Space')).toBe('field');
    expect(scopeOf(focus({ tag: 'textarea', editable: true }), 'Home')).toBe('field');
    expect(scopeOf(focus({ tag: 'div', editable: true }), 'Space')).toBe('field');
    expect(scopeOf(focus({ tag: 'button', inDialog: true }), 'ArrowRight')).toBe('dialog');
  });

  it('RULE-20 a held key repeats frame steps but never toggles play or Esc again', () => {
    expect(resolveKey(key('Space', { repeat: true }), 'none')).toBeNull();
    expect(resolveKey(key('Escape', { repeat: true }), 'none')).toBeNull();
    expect(resolveKey(key('ArrowRight', { repeat: true }), 'none')).toBe('frame-forward');
    expect(resolveKey(key('ArrowLeft', { repeat: true, shiftKey: true }), 'none')).toBe('second-back');
  });

  it('RULE-20 a focused scrollable region or list, grid or tree keeps the arrow, Space and Page keys', () => {
    const region = focus({ tag: 'section', scrollable: true });
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'])
      expect(scopeOf(region, code)).toBe('control');
    expect(scopeOf(region, 'Escape')).toBe('none');
    for (const role of ['listbox', 'grid', 'tree', 'treegrid', 'option', 'gridcell', 'treeitem', 'row']) {
      for (const code of ['ArrowLeft', 'ArrowRight', 'Space', 'PageDown', 'Home', 'End'])
        expect(scopeOf(focus({ role }), code)).toBe('control');
      expect(scopeOf(focus({ role }), 'Escape')).toBe('none');
    }
  });

  it('RULE-20 Scope (build question 205) a focused timeline item takes Enter only: Space plays and pauses there', () => {
    const item = focus({ tag: 'button', timelineItem: true });
    expect(scopeOf(item, 'Space')).toBe('none');
    expect(resolveKey(key('Space'), scopeOf(item, 'Space'))).toBe('play-pause');
    expect(scopeOf(item, 'Enter')).toBe('control');
    expect(resolveKey(key('Enter'), scopeOf(item, 'Enter'))).toBeNull();
    // Shift+Space and a held Space still do nothing; the item's other keys are unchanged (S splits, Delete deletes).
    expect(resolveKey(key('Space', { shiftKey: true }), scopeOf(item, 'Space'))).toBeNull();
    expect(resolveKey(key('Space', { repeat: true }), scopeOf(item, 'Space'))).toBeNull();
    expect(resolveKey(key('KeyS'), scopeOf(item, 'KeyS'))).toBe('split');
    // Any other button keeps Space.
    expect(scopeOf(focus({ tag: 'button' }), 'Space')).toBe('control');
    expect(scopeOf(focus({ tag: 'button', timelineItem: false }), 'Space')).toBe('control');
  });
});
