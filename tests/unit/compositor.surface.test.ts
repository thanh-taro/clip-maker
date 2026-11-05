// MOD-Compositor public surface (specs/40-technical/modules/MOD-Compositor.md "Public surface").
import { expect, it } from 'vitest';
import * as compositor from '../../src/compositor';

it('MOD-Compositor exposes createCompositor, effectsCheck and the CPU reference', () => {
  expect(typeof compositor.createCompositor).toBe('function');
  expect(typeof compositor.effectsCheck).toBe('function');
  expect(typeof compositor.reference.grade).toBe('function');
  expect(compositor.RECOVER_TRIES).toBe(5);
  expect(compositor.RECOVER_INTERVAL_MS).toBe(400);
});
