// MOD-Timeline public surface (phase 3.3 scaffold).
import { expect, it } from 'vitest';
import * as timeline from '../../src/timeline';

it('MOD-Timeline exposes mountTimeline and the zoom commands', () => {
  expect(Object.keys(timeline).sort()).toEqual(['fit', 'mountTimeline', 'scrollToPlayhead', 'zoomIn', 'zoomOut']);
});
