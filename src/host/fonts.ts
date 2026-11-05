// MOD-Host — every typeface loads at start-up (ADR-0012 §2), so the service worker caches them on the
// first visit and no font request follows (NFR-01, D-017). The browser fetches a @font-face only when
// text needs it, so each face is requested explicitly with a sample covering both subsets
// (latin + vietnamese, fonts.css).

/** One Latin and one Vietnamese letter: covers the unicode-range of both subsets. */
const SAMPLE = 'AĐ';
/** UI faces (ADR-0002) and the four text typefaces of ADR-0012 §1 at their one weight. */
const FACES = [
  '500 1em Manrope',
  '700 1em Manrope',
  '500 1em "JetBrains Mono"',
  '400 1em Anton',
  '700 1em "Playfair Display"',
  '800 1em Nunito',
];

/**
 * Loads every face; resolves when they are loaded or failed. Waits for the page's `load` event first:
 * WebKit may run the module before the stylesheet's @font-face rules are in `document.fonts`, and a
 * `load()` that matches no face loads nothing, so the face would be fetched later, on first use
 * (F-020.R4 offline notices, NFR-01). Every declared face is then loaded, whatever its range.
 */
export function loadFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const all = () =>
    Promise.allSettled([
      ...FACES.map((face) => document.fonts.load(face, SAMPLE)),
      ...Array.from(document.fonts as unknown as Iterable<FontFace>, (face) => face.load()),
    ]);
  if (document.readyState === 'complete') return all();
  return new Promise((resolve) => addEventListener('load', () => resolve(all()), { once: true }));
}
