// MOD-Keys — the whole RULE-20 keyboard map (F-017): the view, file and help keys F-017 adds, the scope of
// every key, the toolbar's arrows (CMP-Toolbar, Q102), and the shortcut list CMP-ShortcutHelp shows.
import { describe, expect, it } from 'vitest';
import { HELP_GROUPS, keyCaps, resolveKey, scopeOf, type Action, type FocusInfo } from '../../src/keys';
import { CATALOG } from '../../src/copy/messages.gen';

type Ev = Parameters<typeof resolveKey>[0];
const key = (code: string, mods: Partial<Ev> = {}): Ev => ({
  code,
  key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
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

describe('MOD-Keys RULE-20 view, file and help keys (F-017.R1)', () => {
  it('F-017.R1 RULE-20 View: = and - zoom the timeline (also + and the keypad), Shift+Z fits, N toggles snapping', () => {
    expect(resolveKey(key('Equal', { key: '=' }), 'none')).toBe('zoom-in');
    expect(resolveKey(key('Equal', { key: '+', shiftKey: true }), 'none')).toBe('zoom-in');
    expect(resolveKey(key('NumpadAdd', { key: '+' }), 'none')).toBe('zoom-in');
    expect(resolveKey(key('Minus', { key: '-' }), 'none')).toBe('zoom-out');
    expect(resolveKey(key('NumpadSubtract', { key: '-' }), 'none')).toBe('zoom-out');
    // Ctrl/Cmd with = or - is the browser's page zoom: never taken.
    expect(resolveKey(key('Equal', { key: '=', ctrlKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('Minus', { key: '-', metaKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyZ', { shiftKey: true, key: 'Z' }), 'none')).toBe('zoom-fit');
    expect(resolveKey(key('KeyN'), 'none')).toBe('snapping');
    expect(resolveKey(key('KeyN', { shiftKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('KeyN', { ctrlKey: true }), 'none')).toBeNull();
  });

  it('F-017.R1 RULE-20 History is not shadowed: Mod+Shift+Z still redoes and Mod+Z undoes', () => {
    expect(resolveKey(key('KeyZ', { shiftKey: true, metaKey: true }), 'none', true)).toBe('redo');
    expect(resolveKey(key('KeyZ', { ctrlKey: true }), 'none', false)).toBe('undo');
  });

  it('F-017.R1 RULE-20 Files: Mod+O adds media and Mod+E opens export; plain O is still End here', () => {
    expect(resolveKey(key('KeyO', { metaKey: true }), 'none', true)).toBe('add-media');
    expect(resolveKey(key('KeyO', { ctrlKey: true }), 'none', false)).toBe('add-media');
    expect(resolveKey(key('KeyO', { ctrlKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyO'), 'none')).toBe('set-out');
    expect(resolveKey(key('KeyE', { metaKey: true }), 'none', true)).toBe('export');
    expect(resolveKey(key('KeyE', { ctrlKey: true }), 'none', false)).toBe('export');
    expect(resolveKey(key('KeyE'), 'none')).toBeNull();
  });

  it('F-017.R3 RULE-20 Help: ? shows the list, by the character the layout types', () => {
    expect(resolveKey(key('Slash', { key: '?', shiftKey: true }), 'none')).toBe('help');
    // A German layout types ? with Shift+ß (the US Minus position): still help, not zoom out.
    expect(resolveKey(key('Minus', { key: '?', shiftKey: true }), 'none')).toBe('help');
    expect(resolveKey(key('Slash', { key: '/' }), 'none')).toBeNull();
    expect(resolveKey(key('Slash', { key: '?', shiftKey: true, ctrlKey: true }), 'none')).toBeNull();
  });

  it('F-017 edge case: letter keys follow the US position on a non-Latin layout (S splits, N snaps)', () => {
    expect(resolveKey(key('KeyS', { key: 'ы' }), 'none')).toBe('split');
    expect(resolveKey(key('KeyN', { key: 'т' }), 'none')).toBe('snapping');
    expect(resolveKey(key('KeyZ', { key: 'Я', shiftKey: true }), 'none')).toBe('zoom-fit');
  });

  it('F-017.R5 RULE-20 Scope: no key acts in a field, a dialog or menu, or a control that owns it', () => {
    for (const ev of [
      key('KeyN'),
      key('Equal', { key: '=' }),
      key('Slash', { key: '?', shiftKey: true }),
      key('KeyO', { ctrlKey: true }),
      key('KeyE', { ctrlKey: true }),
    ]) {
      expect(resolveKey(ev, 'field')).toBeNull();
      expect(resolveKey(ev, 'dialog')).toBeNull();
      expect(resolveKey(ev, 'control')).toBeNull();
    }
    expect(scopeOf(focus({ inDialog: true }), 'Slash')).toBe('dialog');
    expect(scopeOf(focus({ tag: 'input', type: 'text', editable: true }), 'KeyS')).toBe('field');
  });

  it('F-017.R5 CMP-Toolbar a button in a toolbar keeps Left and Right (they move between its buttons); other keys act', () => {
    const inBar = focus({ tag: 'button', inToolbar: true });
    expect(scopeOf(inBar, 'ArrowLeft')).toBe('control');
    expect(scopeOf(inBar, 'ArrowRight')).toBe('control');
    expect(scopeOf(inBar, 'Space')).toBe('control');
    expect(scopeOf(inBar, 'KeyS')).toBe('none');
    expect(scopeOf(inBar, 'Home')).toBe('none');
    // Outside a toolbar a button keeps only Space and Enter.
    expect(scopeOf(focus({ tag: 'button' }), 'ArrowLeft')).toBe('none');
  });

  it('F-017.R5 RULE-20 Scope: tabs keep Left, Right, Home and End', () => {
    const tab = focus({ tag: 'button', role: 'tab' });
    for (const code of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Space', 'Enter']) {
      expect(scopeOf(tab, code)).toBe('control');
    }
    expect(scopeOf(tab, 'KeyS')).toBe('none');
  });
});

describe('MOD-Keys the shortcut list (CMP-ShortcutHelp, F-017.R3)', () => {
  const ALL: readonly Action[] = [
    'play-pause',
    'frame-back',
    'go-start',
    'split',
    'set-in',
    'set-out',
    'delete',
    'duplicate',
    'move-earlier',
    'mute',
    'add-text',
    'copy-colour',
    'paste-colour',
    'compare',
    'undo',
    'redo',
    'zoom-in',
    'zoom-fit',
    'snapping',
    'add-media',
    'export',
    'help',
    'escape',
  ];

  it('F-017.AC4 CMP-ShortcutHelp lists every RULE-20 action in the board’s groups and rows', () => {
    expect(HELP_GROUPS.map((g) => g.title)).toEqual([
      'help.group_playback',
      'help.group_history',
      'help.group_files',
      'help.group_edit',
      'help.group_view',
      'help.group_help',
    ]);
    const rows = HELP_GROUPS.flatMap((g) => g.rows);
    expect(rows.map((r) => r.label)).toEqual([
      'help.play_pause',
      'help.frame_step',
      'help.go_ends',
      'action.undo',
      'action.redo',
      'action.add_media',
      'action.export',
      'action.split',
      'action.set_in',
      'action.set_out',
      'action.delete',
      'action.duplicate',
      'help.move',
      'help.mute',
      'action.add_text',
      'action.copy_look',
      'help.paste',
      'action.compare',
      'help.zoom',
      'action.zoom_fit',
      'help.snapping',
      'action.shortcuts',
      'help.esc',
      'help.finish_editing',
    ]);
    for (const r of rows) {
      expect((CATALOG['en-US'] as Record<string, unknown>)[r.label], r.label).toEqual(expect.any(String));
      expect((CATALOG['vi-VN'] as Record<string, unknown>)[r.label], r.label).toEqual(expect.any(String));
    }
    const listed = new Set(rows.flatMap((r) => r.actions));
    for (const a of ALL) expect(listed.has(a), a).toBe(true);
  });

  it('F-017.AC4 every listed key combination resolves to its row’s action (the list is the map)', () => {
    for (const mac of [true, false]) {
      for (const row of HELP_GROUPS.flatMap((g) => g.rows)) {
        for (const combo of row.keys) {
          if (combo.some((k) => k.id === 'Enter')) continue; // Mod+Enter belongs to the text editor (field scope)
          const ev = key(combo.at(-1)!.code, {
            key: combo.at(-1)!.key,
            metaKey: combo.some((k) => k.mod) && mac,
            ctrlKey: (combo.some((k) => k.mod) && !mac) || combo.some((k) => k.id === 'Ctrl'),
            altKey: combo.some((k) => k.id === 'Alt'),
            shiftKey: combo.some((k) => k.id === 'Shift') || combo.at(-1)!.key === '?',
          });
          expect(row.actions, `${row.label} ${combo.map((k) => k.id).join('+')} mac=${mac}`).toContain(
            resolveKey(ev, 'none', mac),
          );
        }
      }
    }
  });

  it('CMP-ShortcutHelp Mod shows as the Command key on mac and Ctrl elsewhere; Alt as Option on mac', () => {
    const undo = HELP_GROUPS.flatMap((g) => g.rows).find((r) => r.label === 'action.undo')!;
    expect(keyCaps(undo.keys[0]!, true).map((c) => c.text)).toEqual(['⌘', 'Z']);
    expect(keyCaps(undo.keys[0]!, true)[0]!.name).toBe('Command');
    expect(keyCaps(undo.keys[0]!, false).map((c) => c.text)).toEqual(['Ctrl', 'Z']);
    const move = HELP_GROUPS.flatMap((g) => g.rows).find((r) => r.label === 'help.move')!;
    expect(keyCaps(move.keys[0]!, true).map((c) => c.text)).toEqual(['⌥', '←']);
    expect(keyCaps(move.keys[0]!, false).map((c) => c.text)).toEqual(['Alt', '←']);
    const redo = HELP_GROUPS.flatMap((g) => g.rows).find((r) => r.label === 'action.redo')!;
    // Ctrl+Y is Control on every platform (Q98).
    expect(keyCaps(redo.keys[1]!, true).map((c) => c.text)).toEqual(['Ctrl', 'Y']);
  });
});
