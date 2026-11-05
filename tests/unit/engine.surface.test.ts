// MOD-Engine public surface (specs/40-technical/modules/MOD-Engine.md "Public surface").
import { expect, it } from 'vitest';
import { createSequentialFrameReader, Engine, startEngineWorker } from '../../src/engine';

it('MOD-Engine exposes its worker starter, the engine and the sequential reader', () => {
  expect(typeof startEngineWorker).toBe('function');
  expect(typeof Engine).toBe('function');
  expect(typeof createSequentialFrameReader).toBe('function');
});
