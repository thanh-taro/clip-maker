// MOD-App — what the shell can check without a browser (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { SOURCE_URL } from '../../src/app/StatusBar';

it('F-020.R3 the source link points at the public repository', () => {
  expect(SOURCE_URL).toBe('https://github.com/thanh-taro/clip-maker');
});
