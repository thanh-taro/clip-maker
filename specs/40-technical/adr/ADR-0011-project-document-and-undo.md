---
id: ADR-0011
title: Project document and undo — immutable snapshots with structural sharing (the suite's model), integer microseconds, a change epoch
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
RULE-13 defines undo steps (including batches, continuous drags and slider moves, Apply to all,
Mute original sound, text editing sessions) and keeps at least 200. After undo or redo the changed
item is selected if it exists and the playhead is limited to the project end. RULE-19 and D-019:
unexported changes count any step made, undone or redone since the session start or the last full
export. The model stores integer microseconds (ENT-Project, `project.schema.json`) and every
timeline time sits on a frame start (rules.md "Frame times"). The sibling tool solved the same
problem with frozen documents, snapshot history and a change epoch (image-annotator ADR 0008);
the model scales here because the project is small data: media stays in files.

## Decision
1. **Document** = the ENT-Project shape from `project.schema.json` as frozen plain objects
   (frame settings, sources' probed metadata and ids, clips, text layers, audio clips). Media is
   never inside it: sources carry an id; MOD-Media's **source registry** maps ids to `File`s and
   probe results. Edit operations in MOD-Project return a new document sharing unchanged objects.
2. **All rule maths in MOD-Core** (pure): frame starts and rounding, RULE-03 length clamping,
   RULE-05 timing, RULE-06 speed steps, RULE-10 fade shrinking, RULE-12 audio placement and the
   D-021/D-027 move rule, RULE-04 re-timing on frame-rate change. Operations compose these; tests
   use property checks for INV-03, INV-04 and INV-06 after every operation.
3. **History** = a list of past steps and a list of redo steps; a step is `{ before, after, changed,
   gesture }` (`changed` = the items it changed, which RULE-13 selects after undo or redo); a new
   step discards the redo steps (F-014.R4). Continuous gestures are coalesced through a gesture
   handle (`beginGesture()` → `{ edit, end, active }`): one drag, one slider movement or one text
   editing session is one step (RULE-13); edits made outside the handle meanwhile stay their own
   steps; a gesture that ends where it began leaves no step and keeps the redo steps; undo, redo and
   New project cut an open gesture and tell its owner. *(Amended 2026-11-10 by F-014, build
   question 96: was "steps `{ before, after, selectionBefore, selectionAfter, coalesceKey }` and a
   cursor … coalesced by key".)*
   **Depth**: the last 200 steps are kept and the oldest beyond 200 are dropped; a later version
   may keep more while the estimated retained size (new objects per step) stays under 32 MB.
   *(Amended 2026-11-16 by the owner, build question 101: was "up to 500 while the estimated
   retained size … stays under 32 MB".)* A worst-case step (Apply to all
   over ~300 clips) retains a few hundred KB, so 200 steps stay well inside the phone budget
   (ADR-0009).
4. **Sources and history**: removing a source is a step; its registry entry (the `File` reference
   and probe data, not decoded media) is kept while any step can restore it, and released when the
   last such step is dropped or on New project (RULE-23).
5. **Change epoch** (RULE-19): a counter incremented by every do, undo and redo; MOD-Project
   records the epoch at session start and at each successful video or audio export (never GIF,
   D-019). Unexported = the project has at least one clip, text layer or audio clip and the epoch
   differs.
6. **Not undo steps** (RULE-13): playhead, zoom, scroll, selection, panels, look hover previews,
   export settings, snapping — kept in separate signals.
7. **Engine sync**: the engine, audio and export workers receive the whole frozen document on each
   change (it is small: tens of KB); they key caches by object identity of clips and sources, so an
   undo reuses cached frames and thumbnails.

## Alternatives considered
- **Command pattern with inverse operations** — dozens of operations with RULE-03/05/10 side
  effects each needing a correct inverse; drift risk. Rejected, like the suite.
- **Immer / a state library** — a dependency for what frozen objects already do.

## Consequences
- Undo cannot desync from the document; selection restore is data.
- The project model is the JSON Schema shape, which makes the M-2 "keep a project" decision
  (PRN-01) a serialisation question, not a redesign.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
