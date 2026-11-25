# Roadmap

### M-1 — Light multi-track editor
The whole M-1 feature set in `20-features/_index.md`, on desktop and phone, in English and Vietnamese, working offline. Success bar:
- the Owner uses Clip Maker instead of a mainstream editor for their own screen recordings and short clips for two weeks;
- the NFR-04 fixture (60 s, 9:16, three phone clips, a title, music) exports with no watermark within the NFR-04 times;
- zero network requests during a full session (NFR-01).

### M-4 — Colour tools (release 1.2.0, D-053)
F-024 Colour mixer, F-025 Colour pop, F-026 Split toning and F-027 Duotone (RULE-24), with CMP-ColourPicker, in the Adjust panel on desktop and phone, in both languages. Ships before the M-2 and M-3 candidates. Building starts once ADR-0017 is accepted after spike SP-colour-tools. Success bar:
- every RULE-24 *Quality* bar passes on the chart, grey-ramp and hue-ring fixtures, in the preview and the export (NFR-08);
- the NFR-03 playback bar holds at 1080p with every colour tool of the release on (ADR-0017);
- projects without colour tools look and export exactly as in 1.1.0.

### M-5 — Colour replace (release 1.3.0, D-053)
F-028 Colour replace (RULE-25) with the eyedropper by pointer, touch and keyboard. Starts once F-028 is `ready` (its open questions answered) and M-4 has shipped. Success bar: the RULE-25 behaviour and RULE-24 *Quality* bars pass with three replacements on, and NFR-03 still holds with every colour tool on.

### M-2 — More creative room (candidates)
Keeping a project on the device between sessions (needs its own decision, PRN-01). Voice-over recording, more transitions, stickers and shapes, zoom and pan on photos and screen recordings, several audio tracks, the user's own look files, adjustment ranges over time, and tablet polish.

### M-3 — Advanced (candidates)
Keyframes, colour keying, picture-in-picture, and saved personal presets.
