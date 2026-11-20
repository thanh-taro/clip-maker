---
id: F-019
title: Fit into the host portal
status: shipped
milestone: M-1
priority: P0
personas: [PER-01]
entities: []
rules: [RULE-17, RULE-20]
screens: [SCR-Editor]
components: [CMP-EmptyState]
nfr: [NFR-01, NFR-07, NFR-09, NFR-04]
events: []
depends_on: []
---

## Intent
The tool should feel like a native part of the portal when embedded, and work fully on its own (PRN-05).

## Scope
- In: theme from the host or the device; filling the given area; standalone use; trusting only allowed hosts.
- Out: sharing anything with the host (PRN-01); language (F-022).

## Requirements
- **R1** When embedded, the tool uses the initial theme from its address from first display, and follows later theme messages (RULE-17).
- **R2** When standalone, the tool follows the device's light/dark preference.
- **R3** The tool fills the area it is given and adapts when that area changes size.
- **R4** Only allowed host origins can embed the tool. Settings messages from anywhere else are ignored.
- **R5** The only message the tool sends is the ready signal, without content (INV-08).
- **R6** Every M-1 feature works standalone and embedded. When embedded, the tool relies on the host frame's grants (RULE-17). Without the download or leave-page grants the browser blocks them silently and the tool can't detect it, which is why the host contract requires them. Until focus moves into the tool (the host's focus after the ready signal, a click or Tab), keys go to the host page. On that first focus, an empty project focuses COPY-action.add_media (CMP-EmptyState); a project with content focuses no control, so Space reaches playback (RULE-20).
- **R7** When embedded, export works the same as standalone, including any scratch space it needs; if the browser gives the embedded tool too little storage or memory for it, the export is refused before it starts with COPY-error.no_space.

## Acceptance criteria
- **AC1** Given the host opens the tool with theme dark, when it first displays, then it is dark with no flash of the light theme. (R1)
- **AC2** Given an embedded, edited project, when the host switches the theme, then the tool switches without reloading or losing anything, playback included. (R1)
- **AC3** Given standalone on a dark device, when it loads, then it is dark. (R2)
- **AC4** Given embedded, when the host area is resized, then the tool fills it without a page scrollbar. (R3)
- **AC5** Given a settings message from an origin that isn't allowed, or from anything other than the embedding page, when it arrives, then it is ignored; given a page that isn't allowed, when it tries to embed the tool, then the browser refuses. (R4)
- **AC6** Given embedded use of every M-1 feature, when messages are observed, then the only one is the ready signal. (R5)
- **AC7** Given the tool embedded with all grants, when the user exports, then the file is saved. (R6)
- **AC8** Given the tool embedded and the host never moved focus, when the user presses Space, then nothing happens in the tool; after a click in the tool, Space plays. (R6)
- **AC9** Given the tool embedded, when the user exports the NFR-04 fixture at 1080, then it succeeds as standalone or is refused before starting with COPY-error.no_space. (R7)

## UX notes
When embedded, the tool shows no theme control and no title of its own.

## Edge cases
- An unknown theme value → keep the current theme.
- Embedded with no theme in the address and no message → follow the device preference.

## Open questions
