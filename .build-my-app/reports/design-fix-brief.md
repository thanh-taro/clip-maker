# Design fix round 1: shared brief

Project root: `/Users/er_lap_mam3_016/Documents/personals/taro-kit-tools/media-tools/clip-maker`.
Board files: `design/canvas/project/*.dc.html`.

## Read first
1. `.build-my-app/reports/design-brief.md`: the format rules still apply, EXCEPT publishing (see below).
2. `.build-my-app/reports/design-review-round-1-audit.md`: spec audit findings (blockers B1–B6, majors, minors).
3. `.build-my-app/reports/design-review-round-1-critique.md`: UI critique findings.
4. `specs/30-experience/style.md`: UPDATED. Read the new "Narrow" layout (D-038) and the "Time, playhead and handles" section (D-039).
5. `specs/30-experience/tokens.json`: UPDATED with dense tokens:
   - `space.0_5` / `1_5` / `2_5` / `3_5` = 2 / 6 / 10 / 14 px
   - `font.size.2xs` 11, `xsPlus` 12.5, `ruler` 10.5, `preview` 19 (mockup text layers only)
   - `radius.xs` / `trackItem` / `clip` / `tile` / `device` = 3 / 5 / 6 / 8 / 28
   - `size.timelineTrack` 56, `timelineLane` 24, `audioLane` 28

   Only token values are allowed. Other one-off values must be replaced by the nearest token.
6. `specs/30-experience/copy.md`: UPDATED.
   - All COPY IDs now exist.
   - Look names have COPY IDs `COPY-look.<id with _>`; use them instead of `data-sample`.
   - New: `COPY-tab.audio`, `COPY-adjust.group_effects`, `COPY-action.go_start` / `go_end`.
   - The vi-VN Looks label is "Bộ lọc".

## Fix rules
- Fix every audit and critique finding that touches YOUR files. Your files are listed in your task. Do not edit other files.
- The **CMP boards are the source of truth**. Screen and flow boards must draw each component the way its CMP board does:
  - one export panel design;
  - one font picker;
  - one music picker;
  - one look gallery;
  - one notice recipe and placement;
  - the same toolbar, inspector tabs and timeline.
- **Phone (narrow) layout per D-038:**
  - Top bar: More menu first, then Undo, Redo, Export (52 px bar, 44 px targets).
  - Tabs: Edit, Audio, Text, Looks, Adjust.
  - A 28 px status row under the tabs (privacy text plus a source icon).
  - Timeline zoom buttons in the timeline corner.
  - Bottom sheets: at most 40 % of the height, overlaying the timeline.
  - Every touch target is at least 44 px (Export, slider knobs' hit area, swatches, notice buttons).
- **Time, playhead and handles per D-039:**
  - Times read m:ss; frames only as a muted suffix in the transport.
  - The playhead has a casing, and its head sits in the ruler band.
  - Trim handles have a grip and look different from the playhead.
  - The cross-fade marker is a bow-tie glyph.
  - The inspector scrolls, with a sticky footer.
- Clip widths must match their durations on the ruler scale, with no dead timeline space.
- Clip labels never overflow; they sit above the waveform, not under it.
- No label below `font.size.2xs`.
- The disabled Export button must stay readable.
- GitHub links get `target="_blank" rel="noopener noreferrer"`.
- Nothing may be clipped at a board edge. If content doesn't fit the board size, reduce the content shown. Never change board sizes: they are fixed in canvas.json, which you must NOT edit.

## Publishing: DO NOT PUBLISH
Write files locally only; the orchestrator publishes everything at the end. Write each file with your file tool, complete.

## Report back (≤ 250 words)
- Files changed or created.
- Findings fixed, by ID.
- Findings you could not fix and why.
- Any new COPY ID you needed (ID | en | vi). Avoid new IDs where possible.
