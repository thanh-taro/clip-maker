// MOD-Media public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import * as media from '../../src/media';

it('MOD-Media exposes intake, registry, thumbnails, waveform and its worker', () => {
  expect(Object.keys(media)).toEqual(
    expect.arrayContaining(['intake', 'registry', 'startAnalysisWorker', 'thumbnails', 'waveform']),
  );
});
