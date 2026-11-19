// MOD-App — the on-screen keyboard's cover (CMP-TextEditor "narrow, keyboard open": the text bar sits on the
// keyboard and the text stays visible above it). Phones shrink the visual viewport for the keyboard but not the
// layout viewport, so the bottom of the layout is covered: `innerHeight − visualViewport.height −
// visualViewport.offsetTop`. Embedded in the portal's frame (RULE-17) the frame's own visual viewport is read;
// a host that does not resize the frame for the keyboard gives no cover, and the bar then sits at the frame's
// bottom (checked on real devices, build question 168).
// Implements: CMP-TextEditor "Behavior" (on narrow layouts the editor keeps the text visible above the on-screen
// keyboard), RULE-21.

/** How much of the layout viewport's bottom the keyboard covers (CSS pixels, never negative). */
export function keyboardCover(innerHeight: number, viewportHeight: number, viewportTop: number): number {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportTop));
}

/**
 * How much of an element whose bottom is `bottom` (CSS pixels from the layout viewport's top) the keyboard
 * covers: the keyboard's cover less the room between the element and the layout viewport's bottom.
 */
export function coverOf(bottom: number, innerHeight: number, viewportHeight: number, viewportTop: number): number {
  return Math.max(0, keyboardCover(innerHeight, viewportHeight, viewportTop) - Math.max(0, innerHeight - bottom));
}

/**
 * Calls `fn` with the keyboard's cover of `element` now and whenever the visual viewport resizes or scrolls;
 * returns the stop function. Without a visual viewport (older engines) the cover is 0.
 */
export function watchKeyboard(element: HTMLElement, fn: (cover: number) => void): () => void {
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
  if (!vv) {
    fn(0);
    return () => undefined;
  }
  const update = (): void =>
    fn(coverOf(element.getBoundingClientRect().bottom, window.innerHeight, vv.height, vv.offsetTop));
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
