// MOD-App — the compact inspector's width (CMP-Inspector "compact", build question 105, decided by the
// owner): a resize grip from `size.inspector` up to 40 % of the tool's width, by drag or the arrow keys.
import { describe, expect, it } from 'vitest';
import { GRIP_STEP, gripKeyWidth, inspectorWidthRange } from '../../src/app/inspector-width';

describe('CMP-Inspector compact resize grip', () => {
  it('Q105 CMP-Inspector "compact" the width runs from size.inspector to 40 % of the tool’s width', () => {
    expect(inspectorWidthRange(900, 288)).toEqual({ min: 288, max: 360 });
    // A tool so narrow that 40 % is under size.inspector: the inspector stays at size.inspector.
    expect(inspectorWidthRange(700, 288)).toEqual({ min: 288, max: 288 });
  });

  it('Q105 the grip on the inspector’s left edge: Left widens, Right narrows, Home and End go to the limits; Shift takes bigger steps', () => {
    const r = { min: 288, max: 360 };
    expect(gripKeyWidth('ArrowLeft', false, 300, r)).toBe(300 + GRIP_STEP);
    expect(gripKeyWidth('ArrowRight', false, 330, r)).toBe(330 - GRIP_STEP);
    expect(gripKeyWidth('ArrowUp', false, 300, r)).toBe(300 + GRIP_STEP);
    expect(gripKeyWidth('ArrowDown', false, 330, r)).toBe(330 - GRIP_STEP);
    expect(gripKeyWidth('ArrowLeft', true, 300, r)).toBe(360);
    expect(gripKeyWidth('ArrowRight', false, 290, r)).toBe(288);
    expect(gripKeyWidth('Home', false, 330, r)).toBe(288);
    expect(gripKeyWidth('End', false, 300, r)).toBe(360);
    expect(gripKeyWidth('Enter', false, 300, r)).toBeNull();
  });
});
