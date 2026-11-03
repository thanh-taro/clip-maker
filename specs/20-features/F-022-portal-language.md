---
id: F-022
title: Use the portal's language
status: ready
milestone: M-1
priority: P1
personas: [PER-02, PER-01]
entities: []
rules: [RULE-18, RULE-17, RULE-15]
screens: [SCR-Editor]
components: []
nfr: [NFR-07, NFR-09, NFR-08]
events: []
depends_on: [F-019]
---

## Intent
The portal speaks English and Vietnamese, and many short-form creators work in Vietnamese (PER-02). The tool should match the portal's language.

## Scope
- In: every user-facing string in en-US and vi-VN, including look names; the language from the host or the browser (RULE-18); number and time formats.
- Out: the user's text layers (never translated); file names (RULE-15); a language control in the tool.

## Requirements
- **R1** Every user-facing string shows in the active language (RULE-18) from first display, and the page is marked with that language.
- **R2** When embedded, the tool follows later language messages without reloading or losing anything.
- **R3** With no language given, or an unsupported one, the language is chosen per RULE-18.
- **R4** Exports and file names are identical in every language (INV-05).
- **R5** Numbers, durations and sizes are written the way the active language writes them.
- **R6** Text in both languages fits every layout down to 320 px wide (NFR-07).

## Acceptance criteria
- **AC1** Given vi-VN in the address, when the tool first displays, then every string is in vi-VN and nothing is shown first in English. (R1)
- **AC2** Given an embedded, edited project in vi-VN, when the host sends en-US, then the UI switches with the project, playback and history unchanged. (R2)
- **AC3** Given no language and browser preferences `[fr-FR, vi]`, when it opens, then it is vi-VN. (R3)
- **AC4** Given the same project, when exported in each language, then both files use the same format, settings, metadata and name pattern, contain no language-dependent text, and their decoded frames and sound match within NFR-08. (R4)
- **AC5** Given vi-VN, when an estimated size of 1234.5 MB shows, then it reads `1.234,5 MB`. (R5)
- **AC6** Given vi-VN at 320 px, when every panel is shown, then no label is clipped and there is no horizontal scrolling. (R6)
- **AC7** Given en-US, when a 1-minute-5-second duration and one clip count show, then they read `1:05` and `1 clip`; with 3 clips, `3 clips`; in vi-VN the count has no plural change. (R5)
- **AC8** Given an export running in vi-VN, when the host switches to en-US, then only the progress text changes language and the export continues unchanged; an open dialog or a text being edited keeps its state. (R2)

## UX notes
No language control; the host owns it.

## Edge cases
- `vi-vn` → vi-VN; `en-GB` → en-US (RULE-18).

## Open questions
