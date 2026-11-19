// MOD-Timeline public surface.
import { expect, it } from 'vitest';
import * as timeline from '../../src/timeline';

// F-013: the zoom commands (zoomIn, zoomOut, fit, scrollToPlayhead) are the mounted view's.
it('MOD-Timeline exposes mountTimeline, the RULE-21 hold time and itemSpan (F-004)', () => {
  expect(Object.keys(timeline).sort()).toEqual(['HOLD_MS', 'itemSpan', 'mountTimeline']);
  expect(timeline.HOLD_MS).toBe(400);
});
