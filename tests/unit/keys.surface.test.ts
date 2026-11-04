// MOD-Keys public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { isMac } from '../../src/keys';

it('RULE-20 Mod is Cmd on macOS, else Ctrl', () => {
  expect(isMac('MacIntel')).toBe(true);
  expect(isMac('Win32')).toBe(false);
});
