// MOD-Keys — the RULE-20 edit keys F-003 uses: Delete or Backspace, Mod+D, Alt+Left/Right, in scope only.
import { beforeEach, describe, expect, it } from 'vitest';
import { isMac, resolveKey, scopeOf, type FocusInfo } from '../../src/keys';
import { EMPTY_HISTORY, history, project, selection } from '../../src/project';
import { runArrangeAction, selectClip } from '../../src/app/arrange';
import { S, audio, ids, photo, proj, video } from '../support/project';

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

  it('RULE-20 F-010.R1 T adds a text layer; never while a text field (CMP-TextEditor) is edited, nor with a modifier', () => {
    expect(resolveKey(key('KeyT'), 'none')).toBe('add-text');
    expect(resolveKey(key('KeyT', { shiftKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('KeyT', { ctrlKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('KeyT'), 'field')).toBeNull();
    expect(scopeOf(focus({ tag: 'textarea', editable: true }), 'KeyT')).toBe('field');
  });

  it('RULE-20 Alt+Left / Alt+Right move the selected clip one place earlier / later', () => {
    expect(resolveKey(key('ArrowLeft', { altKey: true }), 'none')).toBe('move-earlier');
    expect(resolveKey(key('ArrowRight', { altKey: true }), 'none')).toBe('move-later');
    // Plain arrows stay frame steps (F-002); Shift+Alt is the 1 s time move of text and audio (F-010, F-011).
    expect(resolveKey(key('ArrowLeft'), 'none')).toBe('frame-back');
    expect(resolveKey(key('ArrowLeft', { altKey: true, shiftKey: true }), 'none')).toBe('move-earlier-second');
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

describe('MOD-Keys Alt+Shift+Left/Right (RULE-20, Q93)', () => {
  const press = (code: 'ArrowLeft' | 'ArrowRight', shiftKey: boolean): boolean => {
    const action = resolveKey(key(code, { altKey: true, shiftKey }), 'none');
    return action !== null && runArrangeAction(action);
  };
  beforeEach(() => {
    project.value = proj({ clips: [video('A', 4), photo('B', 3), video('C', 5)], audioClips: [audio('m', 2, 4)] });
    history.value = EMPTY_HISTORY;
    selection.value = [];
  });

  it('RULE-20 for a selected clip Shift makes no difference: Alt+Shift+Left/Right move it one place', () => {
    selectClip('B');
    expect(press('ArrowLeft', true)).toBe(true);
    expect(ids(project.value)).toEqual(['B', 'A', 'C']);
    expect(press('ArrowRight', true)).toBe(true);
    expect(press('ArrowRight', true)).toBe(true);
    expect(ids(project.value)).toEqual(['A', 'C', 'B']);
    // One undo step per press, the same as Alt+Left/Right.
    expect(history.value.past).toHaveLength(3);
    expect(press('ArrowLeft', false)).toBe(true);
    expect(ids(project.value)).toEqual(['A', 'B', 'C']);
  });

  it('RULE-20 Alt+Shift+Left/Right with nothing selected are taken (no browser Back) and change nothing', () => {
    expect(press('ArrowLeft', true)).toBe(true);
    expect(press('ArrowRight', true)).toBe(true);
    expect(ids(project.value)).toEqual(['A', 'B', 'C']);
    expect(history.value.past).toHaveLength(0);
  });

  it('RULE-20 an audio clip keeps its Shift meaning: Alt+Shift+Left/Right move it 1 s, Alt+Left/Right one frame', () => {
    selection.value = ['m'];
    expect(press('ArrowRight', true)).toBe(true);
    expect(project.value.audioClips[0]!.start).toBe(3 * S);
    expect(press('ArrowLeft', true)).toBe(true);
    expect(project.value.audioClips[0]!.start).toBe(2 * S);
    expect(press('ArrowRight', false)).toBe(true);
    expect(project.value.audioClips[0]!.start).toBeCloseTo(2 * S + S / 30, -1);
    expect(ids(project.value)).toEqual(['A', 'B', 'C']);
  });
});

describe('MOD-Keys trim keys (RULE-20, F-004)', () => {
  it('RULE-20 S or Mod+B splits at the playhead; I and O start and end the selected item here', () => {
    expect(resolveKey(key('KeyS'), 'none')).toBe('split');
    expect(resolveKey(key('KeyB', { metaKey: true }), 'none', true)).toBe('split');
    expect(resolveKey(key('KeyB', { ctrlKey: true }), 'none', false)).toBe('split');
    expect(resolveKey(key('KeyB'), 'none')).toBeNull();
    expect(resolveKey(key('KeyI'), 'none')).toBe('set-in');
    expect(resolveKey(key('KeyO'), 'none')).toBe('set-out');
    // Modified letters keep the browser's meaning (Mod+S saves, Mod+O opens, …).
    for (const code of ['KeyS', 'KeyI', 'KeyO']) {
      expect(resolveKey(key(code, { metaKey: true }), 'none', true)).toBeNull();
      expect(resolveKey(key(code, { shiftKey: true }), 'none')).toBeNull();
      expect(resolveKey(key(code, { altKey: true }), 'none')).toBeNull();
    }
  });

  it('RULE-20 the trim keys act only in scope: never while a field is edited or a dialog is open', () => {
    for (const code of ['KeyS', 'KeyI', 'KeyO']) {
      expect(resolveKey(key(code), scopeOf(focus({ tag: 'input', type: 'text', editable: true }), code))).toBeNull();
      expect(resolveKey(key(code), scopeOf(focus({ inDialog: true }), code))).toBeNull();
      // A focused button keeps only Space and Enter: S with a clip focused splits.
      expect(resolveKey(key(code), scopeOf(focus({ tag: 'button' }), code))).not.toBeNull();
    }
  });
});
