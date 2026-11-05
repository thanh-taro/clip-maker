---
id: F-023
title: Check device support
status: ready
milestone: M-1
priority: P0
personas: [PER-02, PER-04]
entities: []
rules: [RULE-22, RULE-01, RULE-15, RULE-16]
screens: [SCR-Unsupported, SCR-Editor]
components: [CMP-Notice]
nfr: [NFR-12, NFR-02]
events: []
depends_on: []
---

## Intent
Editing video in a browser depends on what the browser and device can do. The tool must say clearly when something won't work, before the user puts effort in (PRN-07).

## Scope
- In: the start-up check (RULE-22); explaining what's missing; per-source and per-format limits (RULE-01, RULE-15).
- Out: workarounds that would need network services (non-goal).

## Requirements
- **R1** On opening, the tool checks the device per RULE-22. If a check fails, it shows each missing capability and suggests a supported browser, without accepting media. Effects that draw but too slowly never block (RULE-22).
- **R2** Sources the device can't decode are refused one by one with a reason (RULE-01).
- **R3** Export options the device can't encode aren't offered, and the export panel says when a fallback format is used (RULE-15).
- **R4** The check finishes within the start-up time of NFR-02 and makes no network request.
- **R5** A device that encodes video but no sound format still counts as supported. Only the exports that need a sound encoder are unavailable; WAV audio stays available (RULE-22, RULE-16).

## Acceptance criteria
- **AC1** Given a browser that can't decode video, when the tool opens, then SCR-Unsupported shows COPY-unsupported.body with COPY-unsupported.missing_decode and no media can be added. (R1)
- **AC2** Given a supported browser that can't decode HEVC, when the user adds an HEVC video, then it is refused with COPY-reason.codec and other files still work. (R2)
- **AC3** Given a browser without the preferred sound encoder, when export opens, then the panel names the fallback format. (R3)
- **AC4** Given the reference devices, when the tool opens, then the check is done within NFR-02 and the network log shows no request. (R4)
- **AC5** Given a browser that decodes video but can encode no video output format, when the tool opens, then SCR-Unsupported lists COPY-unsupported.missing_encode. (R1)
- **AC6** Given a device whose effects draw below the speed threshold, when the tool opens, then the editor opens with COPY-notice.slow_device and media can be added. (R1)
- **AC7** Given a source that the device decodes slower than real time, when it is added, then it is accepted, COPY-notice.slow_device is shown once for the session, and playback keeps sound in time while the picture shows the newest decoded frame. (R1)
- **AC8** Given a browser that decodes and encodes video but can encode no sound format, when the tool opens, then the editor opens, no COPY-unsupported.missing_encode is listed, and the audio-only export offers WAV only. (R5)

## UX notes
SCR-Unsupported with COPY-unsupported.title and COPY-unsupported.body, listing COPY-unsupported.missing_decode, COPY-unsupported.missing_encode and COPY-unsupported.missing_effects as they apply.

## Edge cases
- A phone browser without the device's video codec interface (one major engine on phones lacks it) → always SCR-Unsupported, as the vision brief accepts.
- Effects too slow for smooth preview, but everything else works → the editor opens with COPY-notice.slow_device.
- A source too heavy for the device to decode in real time (for example a very large screen recording on a phone) → accepted, with COPY-notice.slow_device once; exports are unaffected.

## Open questions
