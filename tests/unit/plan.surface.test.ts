// MOD-Plan public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { SAMPLE_RATE, framePlan } from '../../src/plan';
import { EMPTY_PROJECT } from '../../src/project';

it('MOD-Plan mixes at 48 kHz (architecture.md A4) and exposes framePlan', () => {
  expect(SAMPLE_RATE).toBe(48_000);
  expect(() => framePlan(EMPTY_PROJECT, 0)).toThrow(/not implemented/);
});
