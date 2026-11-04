---
id: ADR-0012
title: Text — four self-hosted OFL typefaces with Vietnamese, rasterised on the main thread, drawn by the compositor
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
RULE-11: four typefaces covering Vietnamese (Sans, Display, Serif, Rounded), size relative to `s`,
outline 8 % of the size, shadow, a rounded box at 70 %, wrapping at 90 % of the frame width, NFC
text, up to 500 user-perceived characters. F-010.R5: the same text in preview and export, from the
tool's own typefaces, offline (NFR-01). NFR-10: typefaces and look data ≤ 1.5 MB together.
Canvas text in workers depends on `FontFace` support in workers, which differs between engines;
the main thread always has the page's fonts. The suite already ships Manrope and JetBrains Mono
with Vietnamese subsets (image-annotator ADRs 0013, 0015, 0020).

## Decision
1. **Typefaces** (all OFL-1.1, Fontsource packages, `latin` + `vietnamese` subsets, WOFF2,
   self-hosted; one weight each for text layers):
   | Role | Face | Weight | Package |
   |---|---|---|---|
   | Sans (default) | Manrope (also the UI face, shared file) | 700 | DEP-06 |
   | Display | Anton | 400 | DEP-08 |
   | Serif | Playfair Display | 700 | DEP-09 |
   | Rounded | Nunito | 800 | DEP-10 |
   UI numbers keep JetBrains Mono (DEP-07). Final picks are a design sign-off on Vietnamese
   stacked marks (e.g. "Ệ", "Ở") at 2 % and 20 % sizes; alternates with Vietnamese coverage:
   Oswald (Display), Lora (Serif), Quicksand or Baloo 2 (Rounded). Bebas Neue is excluded (no
   Vietnamese).
2. **All faces load at startup** with `document.fonts.load` for every face and subset, before media
   can be added, so the service worker caches them on the first visit (D-017) and no font request
   follows (NFR-01).
3. **Rasterising**: MOD-Preview's text rasteriser draws each layer on the main thread with Canvas 2D
   (`fillText`/`strokeText`, `lineJoin: 'round'` for the outline, the box as a rounded path, the
   shadow as an offset blurred copy of fixed size relative to `s`) into an `ImageBitmap` at the
   needed output scale, and transfers it to the engine or export worker. Layout (line breaks where
   typed, wrapping at 90 % of the frame width by measured width, alignment) is computed once per
   layer and scale and cached by content, style and scale. Export requests bitmaps at output scale
   from the main thread, which is idle while the editor is locked.
4. **Text input**: the suite's approach (a transparent text field over the canvas glyphs,
   image-annotator ADR 0009/0020): NFC on commit, the 500-character limit counted with
   `Intl.Segmenter` graphemes in `beforeinput` and on paste (RULE-11, F-010.R6), composition events
   for Vietnamese input methods; user text is only ever drawn or set as `textContent` (NFR-09).
5. **Palette colours** for text come from compiled constants, never the theme (INV-05).

## Alternatives considered
- **Text drawn in the worker with `FontFace` in workers** — fewer transfers, but support differs
  between engines; may be adopted later per engine if SP-compositor shows a gain.
- **Signed-distance-field glyph atlases in WebGL** — crisp at any scale, but complex shaping for
  Vietnamese stacked diacritics and outlines; Canvas 2D already shapes text correctly.
- **System fonts** — differ per device; breaks F-010.R5 and INV-02 across devices.

## Consequences
- Fonts ≈ 200 KB in total (Manrope and JetBrains Mono shared with the UI), leaving ≈ 1.3 MB for
  looks within NFR-10.
- Text bitmaps are a bounded cache (ADR-0009); a big title at 2160p is about 30 MB uncompressed.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
