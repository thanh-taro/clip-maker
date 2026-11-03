---
id: MOD-Project
title: Project — immutable document, edit operations, history, unexported state
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Holds the session's project as frozen objects and applies every edit as an operation built from
MOD-Core's rule maths, so each completed edit is one RULE-13 step. Snapshot history with coalescing
(at least 200 steps), selection restore, playhead limiting after undo or redo, the change epoch for
RULE-19 (GIF never clears it, D-019), copied adjustments, Apply to all, Mute/Unmute original sound,
New project (RULE-23). Exposes signals for the UI.

## Not responsible for
- Files and decoded media (MOD-Media), drawing, sound, export.

## Public surface
- Signals: `project`, `history`, `selection`, `playhead`, `copiedGrade`, `unexported` (computed).
- Operations: `addMedia(batch)`, `placeSource`, `removeSource`, `trim`, `split`, `move`, `delete`, `duplicate`, `setSpeed`, `setPlacement`, `setGrade`, `setLook`, `setFade`, `setCrossfade`, `addText`/`editText`/…, `addAudio`/`moveAudio`/…, `setFrame`, `applyToAll`, `muteOriginal`, `newProject`.
- `beginGesture(key)` / `endGesture()` for coalescing; `undo()`, `redo()`; `markExported(kind)`.

## Implements
F-001.R4/R6 (batch step), F-003, F-004, F-005, F-006, F-007.R3/R4, F-008.R2/R5, F-009, F-010.R1–R4/R7, F-011.R2–R4, F-012, F-014, F-018.R2/R3; RULE-13, RULE-19, RULE-23; INV-03, INV-04, INV-06. Decided by ADR-0011.
