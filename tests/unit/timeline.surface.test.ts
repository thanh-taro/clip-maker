// MOD-Timeline public surface.
import { expect, it } from 'vitest';
import * as timeline from '../../src/timeline';

it('MOD-Timeline exposes mountTimeline, the RULE-21 hold time, the zoom commands and itemSpan (F-004)', () => {
  expect(Object.keys(timeline).sort()).toEqual([
    'HOLD_MS',
    'fit',
    'itemSpan',
    'mountTimeline',
    'scrollToPlayhead',
    'zoomIn',
    'zoomOut',
  ]);
  expect(timeline.HOLD_MS).toBe(400);
});
