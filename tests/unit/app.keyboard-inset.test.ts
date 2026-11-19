// MOD-App — the on-screen keyboard's cover (CMP-TextEditor "narrow, keyboard open": the text bar sits on the
// keyboard and the text stays visible above it). The real keyboard is a device check (build question 168).
import { describe, expect, it } from 'vitest';
import { coverOf, keyboardCover } from '../../src/app/keyboard-inset';

describe('CMP-TextEditor the keyboard cover (visualViewport)', () => {
  it('CMP-TextEditor RULE-21 the cover is innerHeight − visual viewport height − its offset, never negative', () => {
    // iPhone portrait, 844 px tall, a 336 px keyboard: the visual viewport is 508 px from the top.
    expect(keyboardCover(844, 508, 0)).toBe(336);
    // The page scrolled by the browser to show the field: the offset counts.
    expect(keyboardCover(844, 508, 40)).toBe(296);
    // No keyboard; pinch zoom (a smaller viewport scrolled inside the layout) never gives a negative cover.
    expect(keyboardCover(844, 844, 0)).toBe(0);
    expect(keyboardCover(844, 400, 600)).toBe(0);
  });

  it('CMP-TextEditor the stage is covered only below the room left under it', () => {
    // The stage ends 60 px above the layout's bottom (the status row): a 336 px keyboard covers 276 px of it.
    expect(coverOf(784, 844, 508, 0)).toBe(276);
    expect(coverOf(784, 844, 844, 0)).toBe(0);
  });
});
