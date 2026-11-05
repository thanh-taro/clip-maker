// MOD-Scratch public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { lockName, SCRATCH_DIR } from '../../src/scratch';

it('MOD-Scratch names its directory and per-session Web Lock (ADR-0010 outcome)', () => {
  expect(SCRATCH_DIR).toBe('clip-maker-scratch');
  expect(lockName('abc')).toBe('clipmaker-scratch:abc');
});
