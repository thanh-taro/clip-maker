// MOD-Project public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { EMPTY_PROJECT, isEmpty, project } from '../../src/project';

it('RULE-04 a new session starts empty with the default frame (Original, 30 fps, black)', () => {
  expect(project.value).toBe(EMPTY_PROJECT);
  expect(isEmpty.value).toBe(true);
  expect(EMPTY_PROJECT.frame).toEqual({ aspect: 'original', frameRate: 30, background: 'black' });
  expect(Object.isFrozen(EMPTY_PROJECT)).toBe(true);
});
