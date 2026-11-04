// MOD-Audio public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import { WORKLET_URL, render, startAudioWorker, startExportAudioWorker } from '../../src/audio';

it('MOD-Audio exposes the worklet module URL, its two workers and render', () => {
  expect(WORKLET_URL).toMatch(/playback\.worklet/);
  expect(typeof startAudioWorker).toBe('function');
  expect(typeof startExportAudioWorker).toBe('function');
  expect(typeof render).toBe('function');
});
