---
id: F-018
title: Warn before losing work
status: building
milestone: M-1
priority: P1
personas: [PER-03]
entities: [ENT-Project]
rules: [RULE-19, RULE-13, RULE-23]
screens: [SCR-Editor]
components: [CMP-ConfirmDialog, CMP-Toolbar]
nfr: []
events: []
depends_on: [F-014]
---

## Intent
Nothing is kept between sessions (PRN-01), so closing the page or starting over loses the work. The tool must warn first (PER-03).

## Scope
- In: the warning when leaving the page or starting a new project while there are unexported changes (RULE-19); starting a new project.
- Out: keeping projects (M-2 candidate).

## Requirements
- **R1** When there are unexported changes, leaving or reloading the page asks the browser to warn the user.
- **R2** The user can start a new project. With unexported changes, the tool asks for confirmation first.
- **R3** Starting a new project follows RULE-23.

## Acceptance criteria
- **AC1** Given an edited, unexported project, when the user closes the tab, then the browser shows its leave-page warning. (R1)
- **AC2** Given a project just exported with no edits since, when the user closes the tab, then no warning is shown. (R1)
- **AC3** Given unexported changes, when the user picks new project, then CMP-ConfirmDialog asks with COPY-confirm.new_project; on cancel, nothing changes. (R2)
- **AC4** Given confirmation, a 9:16 project at 60 fps, a chosen export resolution and copied adjustments, when the new project starts, then the media panel and timeline are empty, undo is unavailable, the frame is Original at 30 fps with detection on, paste is unavailable, and the export resolution is kept. (R3)
- **AC5** Given a project with no unexported changes, when the user picks new project, then it starts without asking. (R2)

## UX notes
CMP-Toolbar holds COPY-action.new_project.

## Edge cases
- Some browsers never show the leave-page warning from inside a frame. The tool can't detect this (see `40-technical`).

## Open questions
