# Design critique, round 3 (Clip Maker): final verification

Input: 82 screenshots, version 37 (`.build-my-app/reports/design-shots/`), compared with round 2 (`design-shots-r2/`, `design-review-round-2-critique.md`). Checked against `specs/30-experience/style.md` and `tokens.json`. The 2 majors in `design-review-round-3-audit.md` (export-error_wide theme split; icon-only Copy/Paste in the wide Adjust footer) are not repeated here.

Severity: **B** blocker, **M** major (users will notice), **m** minor.

**Summary:** Round 2: 9 fixed, 3 partly fixed, 0 not fixed. New findings: **B 0, M 1, m 7**. **Sign-off: ready for owner approval, with the follow-ups listed below** (R3-1 plus the 2 audit majors, all one-pass fixes).

## 1. Status of the round-2 findings

| # | Finding | Status | Evidence / what remains |
|---|---|---|---|
| N1 | [B] Sheet hides transport and timeline | **Fixed** | Transport plus ruler and main-track peek above every sheet (`selected_narrow`, `default_narrow` light Audio tab, `editing-text_narrow` light). `default_narrow` dark opens with no sheet. The 320 x 568 vi board keeps the peek. |
| N2 | [M] Phone Adjust footer too tall | **Fixed** | One 44 px row: Hold to compare, Apply to all clips, kebab. 4 sliders visible, not 3. |
| N3 | [M] Notice stacks | **Fixed** | At most 2 notices plus a "+1 more" chip. Lists show 3 items plus Show all. The stack sits above the transport, and lanes stay clear (`result_narrow`, `adding_narrow`). There is one progress layout, and "Shortened" uses the info recipe everywhere. |
| N4 | [M] Export error titles | **Fixed** | Outcome titles in `danger` with an icon per cause, on wide, narrow and CMP. Copy echo: see m1. |
| N5 | [M] Wide inspector divergence | **Partly** | The 4 tabs and the Light/Colour order now match CMP. The footer is still open (audit M2). |
| N6 | [M] Size target unreachable | **Fixed** | Field in view with a `danger` border, Balanced selected. Footer: Cancel, Use 3 MB, disabled Export. |
| N7 | [m] Narrow/CMP variants | **Fixed** | Kebab More everywhere. The edit-sheet tiles match CMP-Timeline. Text editing uses Undo, Redo, Done. The empty-state reason sits in its own row below the bar. |
| N8 | [m] Clip labels, small mono | **Partly** | "0:03" short label and label-above-thumbnails are consistent. `2xs` and `ruler` text sizes are now allowed by the spec (accessibility owner to confirm, as in the audit). |
| N9 | [m] Light playhead equals handle | **Fixed** | Handles are now neutral (`#16111F` light, `#EFEAF8` dark) with a `bg` grip. The playhead stays mango, so the two are clearly different marks in `Main_*` and `selected_narrow`. |
| N10 | [m] vi-VN | **Partly** | Fixed: 4 tile columns at 320, "Hiệu ứng mờ" row label, decimal comma. Still open: "Kết thúc tại đây" wraps (already in the audit). |
| N11 | [m] Fixture contradictions | **Partly** | `street.mov` and 24 MB are now used everywhere. New mismatch: see m2. |
| N12 | [m] Polish | **Fixed** | Zoom pill sits in its own band below the audio lane. The "Black & White" category fits. The trim tooltip reads "Length 0:09 · ends 0:30". |

## 2. New findings

### R3-1. [M] Export uses an upload icon on wide, which contradicts "Your media never leaves this device"
**Boards:**
- `SCR-Editor_exporting_wide_*` (dialog title icon).
- `exporting-setup_wide_*` (footer Export button).

CMP-ExportProgress, `exporting_narrow` and the narrow export sheet all use the download (save-to-device) icon.

**Why it matters:** an arrow-up icon on Export in a privacy-first app suggests the video is being sent somewhere, right next to the privacy line in the status bar. It is also a third icon variant for the same component.

**Fix:** use the CMP download icon for every Export action and every progress title. Keep the upload icon only for the "Adding n of m" import notice.

### Minors
- **m1. Copy echo** (export-error, all layouts): the body repeats the title ("Export failed. Export failed. Your edits are safe…"). Drop the first body sentence. For no space, add a next step: "Free up space or choose a smaller size."
- **m2. Fixture** (`result_narrow`): it shows `0:13·08 / 10:00` over sunset.mp4 at 0:05–0:20, while `result_wide` shows `9:50·00` over harbour/trip at 9:00. Use the wide fixture so the "Shortened" state looks like the end of a 10-minute project.
- **m3. Exporting wide vs narrow:** the wide dialog leaves out the settings line ("1080p MP4 · Balanced · About 24 MB") that narrow and the error dialogs show. Add it under the bar.
- **m4. Severity mix** (`exporting-setup_wide_light`): the field border is `danger` but the message box is `warnBg`. Use one severity: `danger` for both, since Export is blocked.
- **m5. Compact timeline toolbar** (`selected_compact_*`): it is icon-only, and its order (Earlier, Later | Delete, Duplicate) differs from CMP-Timeline (Delete, Duplicate | Earlier, Later). Match the CMP order, and keep Split and Delete labelled at compact width.
- **m6. Lane chips:** CMP-Timeline prefixes text and audio items with T and music icons, but the SCR boards do not. The waveforms also differ (real shape in CMP, barcode in SCR). Pick the CMP look.
- **m7. Text sheet** (`editing-text_narrow` light): Earlier, Later (time) and Bring forward, Send back (layer order) share one row under STYLE. Move them to an "ARRANGE" group and name the first two "Move earlier" and "Move later", as on the Edit sheet.

## 3. Keep (use as the reference)
- The phone layout: top bar, preview, transport, timeline peek, a capped sheet and the tab bar (`selected_narrow`). This is now the model for every narrow sheet.
- Neutral trim handles against the mango playhead (D-039), and the export-error dialog structure (outcome title, cause icon, settings line, two actions).
