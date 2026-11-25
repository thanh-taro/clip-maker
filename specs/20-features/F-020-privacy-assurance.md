---
id: F-020
title: Show the privacy guarantee
status: ready
milestone: M-1
priority: P1
personas: [PER-01, PER-02]
entities: []
rules: []
screens: [SCR-Editor]
components: [CMP-StatusBar]
nfr: [NFR-01, NFR-07]
events: []
depends_on: []
---

## Intent
People only bring private footage to a tool they trust. Tell them plainly, and make it true by construction (PRN-01).

## Scope
- In: a visible privacy statement, a short explanation, the source repository link, and the licence notices.
- Out: the guarantee itself (NFR-01).

## Requirements
- **R1** A short privacy statement is always visible.
- **R2** The user can open a brief explanation of what the tool does and does not do with their media, including scratch space during export.
- **R3** A link to the source repository (`https://github.com/thanh-taro/clip-maker`) is visible next to the statement. It opens in a new tab with no referrer and doesn't change the session.
- **R4** The explanation opens the licence notices inside the tool, with no network and no new tab. They list every shipped dependency and asset with its title, source and licence.

## Acceptance criteria
- **AC1** Given the tool, when the user looks at the status area, then COPY-privacy.badge is visible at 320 px and at desktop width. (R1)
- **AC2** Given the statement, when the user activates it, then COPY-privacy.details is shown and can be dismissed. (R2)
- **AC3** Given an edited project, when the user opens the source link, then `https://github.com/thanh-taro/clip-maker` opens in a new tab with no referrer and the project is unchanged. (R3)
- **AC4** Given the tool embedded in a frame that blocks new tabs and offline, when the user opens COPY-privacy.notices, then COPY-privacy.notices_title shows inside the tool, listing every shipped dependency and typeface with title, source and licence, and no music (D-052). (R4)

## UX notes
CMP-StatusBar holds COPY-privacy.badge and COPY-privacy.source_label.

## Edge cases
- A host frame that blocks new tabs → the source link does nothing; the notices still open inside the tool (R4).

## Open questions
