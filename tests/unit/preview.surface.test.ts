// MOD-Preview public surface (specs/40-technical/modules/MOD-Preview.md "Public surface").
import { expect, it } from 'vitest';
import * as preview from '../../src/preview';

it('MOD-Preview exposes mountPreview, rasteriseText and enterFullscreen', () => {
  expect(typeof preview.mountPreview).toBe('function');
  expect(typeof preview.rasteriseText).toBe('function');
  expect(typeof preview.enterFullscreen).toBe('function');
  expect(typeof preview.fullscreen).toBe('function');
});
