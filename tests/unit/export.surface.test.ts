// MOD-Export public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { estimate, start, startExportWorker } from '../../src/export';

it('MOD-Export exposes estimate, start and the idle export worker', () => {
  expect(typeof estimate).toBe('function');
  expect(typeof start).toBe('function');
  expect(typeof startExportWorker).toBe('function');
});
