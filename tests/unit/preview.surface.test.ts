// MOD-Preview public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import * as preview from '../../src/preview';

it('MOD-Preview exposes mountPreview, rasteriseText and enterFullscreen', () => {
  expect(Object.keys(preview).sort()).toEqual(['enterFullscreen', 'mountPreview', 'rasteriseText']);
});
