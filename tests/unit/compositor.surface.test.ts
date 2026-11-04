// MOD-Compositor public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { createCompositor, effectsCheck } from '../../src/compositor';

it('MOD-Compositor exposes createCompositor and effectsCheck (built with F-002 / F-023)', () => {
  expect(typeof createCompositor).toBe('function');
  expect(typeof effectsCheck).toBe('function');
});
