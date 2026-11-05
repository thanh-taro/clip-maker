// MOD-Host — every typeface loads at start-up (ADR-0012 §2), so the service worker caches them on the
// first visit and no font request follows (NFR-01, D-017). The browser fetches a @font-face only when
// text needs it, so every declared face (fonts.css: the UI faces of ADR-0002 and the four text
// typefaces of ADR-0012 §1, latin + vietnamese subsets) is loaded explicitly.

/**
 * Loads every declared face; resolves when they are loaded or failed. Waits for the page's `load` event
 * first: WebKit may run the module before the stylesheet's @font-face rules are in `document.fonts`, and
 * the faces would then be fetched later, on first use (F-020.R4 offline notices, NFR-01).
 */
export function loadFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const all = () =>
    Promise.allSettled(Array.from(document.fonts as unknown as Iterable<FontFace>, (face) => face.load()));
  if (document.readyState === 'complete') return all();
  return new Promise((resolve) => addEventListener('load', () => resolve(all()), { once: true }));
}
