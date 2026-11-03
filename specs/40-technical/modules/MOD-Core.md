---
id: MOD-Core
title: Core — domain types and every rule's maths (pure)
status: draft
depends_on: []
---

## Responsibility
The ENT- types from `project.schema.json`, integer-microsecond time and the "Frame times"
conventions of `rules.md` (frame starts, rounding, minimum durations, halves), and the pure rule
maths: RULE-02 limits and scale-down sizes, RULE-03 length clamping, RULE-04 frame settings and
re-timing on a rate change, RULE-05 clip timing (add, trim, split, delete, reorder, duplicate),
RULE-06 speed steps and stops, RULE-07 placement geometry (fit/fill on the rotated clip, snapping
to centre lines), RULE-10 fade and cross-fade limits and shrinking, RULE-11 text defaults, timing
and snapping to safe margins, RULE-12 audio placement and the move rule (D-021, D-027), RULE-14
snapping targets and zoom limits, RULE-15 resolution offers, bitrate tables, floors and size-target
feasibility, RULE-16 GIF range, RULE-15 file names, magic-byte sniffing. Also the typed message
protocol between threads.

## Not responsible for
- Holding state or history (MOD-Project), any DOM, worker, codec or GPU API.

## Public surface
- Types: `Project`, `Source`, `Clip`, `TextLayer`, `AudioClip`, `MusicTrack`, `ExportSettings`, `Micros`.
- Time: `frameStart(k, rate)`, `snapToFrame(t, rate)`, `framesOf(d, rate)`, `minDuration(rate)`.
- Rule functions named after their rules, returning new values plus the notice to show (e.g. `length_limited`).
- Export tables: `bitrateFor(resolution, quality, rate)`, `floorFor(resolution, rate)`, `sizeTargetPlan(project, settings)`.
- `sniff(bytes)`, `exportFileName(date, ext)`, worker message types.

## Implements
F-001.R2/R3 (rules), F-003, F-004, F-005.R1/R2/R4, F-006 geometry, F-009 limits, F-010 timing and snapping, F-011.R1/R2, F-012, F-013 snapping/zoom maths, F-015.R1/R2 tables, F-016.R1; RULE-02…RULE-07, RULE-10…RULE-12, RULE-14…RULE-16; INV-03, INV-04, INV-06. Decided by ADR-0010, ADR-0011.
