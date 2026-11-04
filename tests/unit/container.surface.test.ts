// MOD-Container public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { createOutput, openInput } from '../../src/container';

it('MOD-Container exposes openInput and createOutput (built with F-001 / F-015)', () => {
  expect(typeof openInput).toBe('function');
  expect(typeof createOutput).toBe('function');
});
