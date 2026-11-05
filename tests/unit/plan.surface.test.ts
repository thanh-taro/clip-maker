// MOD-Plan public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { SAMPLE_RATE, gifFramePlan } from '../../src/plan';
import { EMPTY_PROJECT } from '../../src/project';

it('MOD-Plan mixes at 48 kHz (architecture.md A4) and fails loudly for what is not built yet', () => {
  expect(SAMPLE_RATE).toBe(48_000);
  expect(() => gifFramePlan(EMPTY_PROJECT, {}, 0)).toThrow(/not implemented/);
});
