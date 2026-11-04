// MOD-Engine public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { createSequentialFrameReader, startEngineWorker } from '../../src/engine';

it('MOD-Engine exposes its worker starter and the sequential reader', () => {
  expect(typeof startEngineWorker).toBe('function');
  expect(() => createSequentialFrameReader()).toThrow(/not implemented/);
});
