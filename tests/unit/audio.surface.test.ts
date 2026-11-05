// MOD-Audio public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { WORKLET_URL, render, startAudioWorker } from '../../src/audio';

it('MOD-Audio exposes the worklet module URL, its worker and render', () => {
  expect(WORKLET_URL).toMatch(/playback\.worklet/);
  expect(typeof startAudioWorker).toBe('function');
  expect(typeof render).toBe('function');
});
