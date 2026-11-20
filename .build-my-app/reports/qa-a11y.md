# Phase 5 QA: accessibility audit (NFR-06, NFR-07, RULE-20, F-017)

Method: code and image review only. Nothing was run (no app, e2e, Playwright, build or `pnpm check`). Contrast figures are computed from `specs/30-experience/tokens.json`. Screenshots viewed: `screens/F-017/{toolbar-roving,touch-text-sheet,help-narrow-vi-VN}.png`, `screens/F-013/narrow-zoomed-vi-VN.png`, `design-shots/SCR-Editor_selected_narrow_vi.png`, `design-shots/SCR-Editor_exporting-setup_narrow.png`. Static images cannot show focus order, live regions or real touch behaviour, so those items are in section 4.

Overall: the code is strong. Native `<dialog>` with showModal, roving toolbars, radiogroups, tablists, slider `aria-valuetext`, 44 px coarse-pointer targets, `aria-disabled` for unavailable controls, and `forced-colors` and reduced-motion blocks are all in place. There is no blocker found by reading. The majors below are gaps against NFR-06's wording and WCAG A/AA that automated axe cannot catch.

## 1. Findings (ranked)

### Major

M1. Edits and selection changes are not announced (WCAG 4.1.3 Status Messages, AA; NFR-06 "announcements cover playback state, the selection and export progress").
- Where: `src/app/Preview.tsx:48-49,210-221,298` (the only status region announces the time, and only when playback stops). `src/app/NoticeStack.tsx:189-195` carries notices only. `src/app/adding.ts:150` is the only success notice.
- Gap: Split, Delete, Duplicate, Move earlier/later, Undo/Redo, Apply to all, paste of adjustments, "Start/End here", and selection changes made by those actions produce no live message. Focus often stays on a button, so a screen-reader user hears nothing. Playback start is announced only through the Play/Pause button's name change; pressing Space on a timeline item (RULE-20, Q205) starts playback with no feedback at all.
- Fix: add one visually hidden polite `role="status"` (reuse `.tk-preview-status`) fed by a small `announce(text)` helper. Messages: "Split. 3 clips", "Deleted clip 2", "Moved earlier, position 1 of 4", "Undid: <action>", "Playing", "Selected: <name> <length>". Add the strings to `copy.md` in EN and VI.

M2. Single-character shortcuts have no turn-off or remap (WCAG 2.1.4 Character Key Shortcuts, Level A).
- Where: `src/keys/index.ts:109-189` (`scopeOf`/`resolveKey`) and the document-level binders (`src/timeline/view.ts:1766`, `src/app/playback.ts`, `src/app/adjust.ts`). Unmodified S, I, O, M, T, N, Shift+Z, `=`, `-`, `?` and `\` act whenever focus is not in a field or dialog.
- Gap: RULE-20 scopes them to "focus in the tool", but standalone the tool is the whole page. 2.1.4 allows only (a) a way to turn off, (b) remap, or (c) active only while a component has focus. Voice-dictation and speech-input users trigger these by accident.
- Fix, cheapest first: (1) activate letter keys only while focus is inside the editor container, and not on the page body or browser chrome; or (2) add a "Keyboard shortcuts on/off" switch in CMP-ShortcutHelp, persisted for the session. The modifier combos (Mod+Z and the rest) and arrows are not affected. This needs a spec change: RULE-20 and F-017.

M3. A phone user who cannot drag has no efficient visible way to move the playhead (WCAG 2.5.1 Pointer Gestures, 2.5.7 Dragging Movements, NFR-06 "never gesture-only"; also affects the VoiceOver iOS pass of FLOW-01 step 4).
- Where: `src/app/styles/preview.css:132-134` hides Go to start and Go to end on narrow. `src/timeline/view.ts:341-343` makes the ruler `aria-hidden`, and it is pointer-only (scrub, tap-to-centre, lines 1059-1093, 1340-1346). The only phone controls are 1-frame step buttons (`Preview.tsx:128-148`).
- Gap: with VoiceOver or Switch Control the playhead can only move one frame per activation (about 1700 taps for a 58 s clip at 30 fps). Splitting or trimming at a chosen time (FLOW-01 step 4) is impractical. Desktop is fine (Shift+arrow = 1 s, Home/End).
- Fix: keep Go to start/end on phone (the transport has room at 320 px if the time is shortened), add Back 1 s / Forward 1 s buttons or a press-and-hold repeat on the frame buttons. Alternatively expose the timeline as a `role="slider"` (adjustable, `aria-valuetext` "0:13 of 0:58") so the VoiceOver rotor can adjust it.

M4. Landscape phone, 768 px and 1920 px have no evidence (NFR-07: "portrait and landscape", screenshots at 320, 390, 768, 1280 and 1920 px in both themes and both languages).
- Where: `rg landscape|orientation` finds nothing in `src/app/styles` or `tests/e2e`. Layout tiers depend on width only (`layout.css:91,102`) with fixed row heights (`tokens.gen.css`: toolbar 40, transport 44, track 56 plus lanes, tab bar 56, status bar 28). At 667x375 (width under 700 means the phone layout) the preview and an open sheet would compete for about 375 px of height.
- Gap: no screenshot exists at 568x320, 667x375 or 844x390. Existing shots are 390x844-ish and 320x568 (portrait) and wide desktop only.
- Fix: capture the phone layout in landscape and review it (owner pass). If the preview collapses, add a `(max-height: 480px)` rule: hide the status bar text, make sheets scroll inside a capped height, and allow the preview to shrink to about 25 % of the height.

### Minor

m1. Timeline has two toolbars and a region all named "Timeline" (WCAG 2.4.6 Headings and Labels, 4.1.2). `src/app/Timeline.tsx:281-282,304`: the `<section>`, the action toolbar and the zoom-pill toolbar share `aria-label={t('timeline.label')}`. Give the toolbars distinct names (for example "Timeline actions" and "Timeline zoom"). Add `timeline.actions` and `timeline.zoom_label` to the catalogue.

m2. Rejected number input reverts silently (WCAG 3.3.1 Error Identification, 4.1.3). `src/app/NumberField.tsx:99-110` (empty or unreadable text restores the old value; typed out-of-range is clamped) and the GIF From/To fields `src/app/ExportPanel.tsx:240-262`. A screen-reader user is not told the value was changed. Fix: announce through the M1 status region ("Not a number, kept 0:03" or "Limited to 200 %") and set `aria-invalid` briefly.

m3. No `<h1>` once the project has media (WCAG 1.3.1, 2.4.6, best practice). `EmptyState.tsx:16` is the only h1; the editor then has h2 sheet titles but no top heading. Give the preview region or toolbar a visually hidden h1 "Clip Maker". This is also useful for VoiceOver's heading rotor.

m4. Focus on the main-track group has no visible indicator (WCAG 2.4.7 Focus Visible). `src/timeline/view.ts:344` (`track.tabIndex = -1`) with `src/app/styles/timeline.css:263` (`outline: none`). After the last clip is deleted focus lands there and nothing shows it (the empty-state dashed border is the only cue, and only when empty). Fix: `:focus-visible` outline on `.tk-track` (the global `:focus-visible` rule is overridden).

m5. Momentum glide ignores `prefers-reduced-motion` (WCAG 2.3.3 is AAA, so advisory). `src/timeline/view.ts:1350-1376` runs a rAF glide after a touch flick, and `reset.css:28` only shortens CSS. Fix: when `matchMedia('(prefers-reduced-motion: reduce)').matches`, call `settle()` straight away instead of gliding. All CSS animations are inside `no-preference` blocks or are neutralised by `reset.css`, so no other motion issue was found.

m6. Selected clips are `aria-pressed` buttons that ignore Space (RULE-20, Q205). `src/timeline/view.ts:697,942,993` and the keyup guard at line 1768-1773. VoiceOver activation (VO+Space) sends a click, so it works, but keyboard users get a toggle button that does not toggle on Space. This is a deliberate owner decision, so document it in the help list (it is in RULE-20); consider `role="option"` in a `listbox`, or `aria-current`, if SR users report confusion.

m7. Look tile focus changes the preview (`src/app/LookGallery.tsx:131`, `previewLook` on focus). It is not a change of context under 3.2.1, and the status line is announced (`LookGallery.tsx:328`). Keep, but confirm in the VoiceOver pass that the "previewing" status is not read on every arrow press.

m8. `aria-valuetext={String(value)}` on the look-intensity slider (`LookGallery.tsx:254`) repeats the number. Use "80 %" so it matches the visible "80".

m9. Phone tab bar is a `tablist` on which no tab may be selected (`EditSheet.tsx:180-200`: clicking the open tab closes the sheet). Acceptable under ARIA, but VoiceOver says "tab 3 of 5" with no selection. Check in the manual pass.

m10. Contrast margins (tokens, WCAG 1.4.3 and 1.4.11). All text and focus pairs pass AA in both themes (examples: fg on bg 16.5/17.8, muted on surface 6.3/6.9, mango accent on bg 11.4 in dark, accent text on bg 5.2 in light, onAccent on accent 11.0/5.4, danger on dangerBg 6.9/5.0, focus ring on bg and surface 6.0 or more). Narrow margins, none a failure today:
- Light `accent` on `selection` is 4.64 and on `workArea` 4.51 (text-size use only; it fails if the text moves to a lighter tint).
- Dark `lineStrong` on `selection` is 2.80, below the 3:1 non-text bar, if a control border is ever drawn on the selection fill. The selected option uses an accent border today (see the screenshots).
- Dark `muted` on `trackClip` is 4.34 and light `waveform` on `trackAudio` is 4.69 (labels use `trackLabel`, 8.3 or more, so no issue).
Axe cannot test canvas or gradient content (clip thumbnails, look thumbnails, preview), so these token numbers are the only check there.

m11. Ruler labels collide with the playhead in some zoom states (`screens/F-013/narrow-zoomed-vi-VN.png`: "0:05" is struck through by the playhead head). The `--under` class (`view.ts:1012`) does not cover that offset. Cosmetic (the ruler is `aria-hidden`), but it affects legibility (1.4.3 intent).

m12. Narrow media sheet is `aria-modal="true"` without `inert` on the page behind (`src/app/MediaPanel.tsx:290-298`). Tab is trapped by script, and VoiceOver honours aria-modal, but a touch-explore user on some builds can still reach the editor. Use `inert` on siblings (as `Preview.tsx:230-248` does) or switch to `showModal()`.

### Verified OK (no action)
- Names, roles and values: every icon button has `aria-label`; visible text matches the accessible name (2.5.3), including timeline items (`name length`); sliders carry `aria-valuetext` (`Speed`, `Sound`, `Position`, `Adjust`, `Fades`, `Duration`, `Text`); `NumberField` is a labelled spinbutton with `inputmode`.
- Keyboard: roving toolbars (`roving.ts`), radiogroups, tabs, menu, the inspector resize grip (`role="separator"`, arrows/Home/End), dialogs with focus return and Esc, wide-drawer Esc (Q208), full-screen Tab wrap.
- Gesture alternatives (2.5.7): clip reorder, Move earlier/later and Alt+arrows; trim, Start/End here; placement, Scale slider and Offset fields plus arrow buttons (screenshot touch-text-sheet); pinch, Zoom +/-/Fit; cross-fade, join button with a popover.
- Target size (2.5.8): `--tk-size-target-min` 24 px minimum, 44 px on `pointer: coarse` for transport, notices, handles (`handle-hit` 44 px) and join controls (`fades.css:247-257`). Spacing is respected.
- Focus ring: global `:focus-visible` 2 px violet, with `outline:none` overrides replaced by `box-shadow` or thumb styles (looks tile, Adjust slider, checked in `looks.css:126` and `adjust.css:169`).
- Language: `lang` is set on `<html>` at boot and on change (`host/index.ts:53`, `boot.js:31`). VI strings are generated from `copy.md` (312 messages x 2 languages, so no missing keys). Long VI labels wrap on the 320 px tab bar and tiles without clipping (screenshots).
- Reflow and zoom: viewport allows pinch zoom (no `user-scalable=no`); sheet content scrolls inside its panel at 320 px.
- High contrast: `forced-colors` blocks exist in every stylesheet that draws state.

## 2. Automated coverage (axe, `tests/e2e`)

What runs: about 100 `AxeBuilder` calls over 23 spec files with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`. Each asserts zero violations. Most feature specs pair a 1280 px check with a 320 px check, in en-US and vi-VN.

Covered states (examples):
- Desktop 1280 px and phone 320 px: editor with a selected clip, Undo/Redo, tab bar plus zoom pill, Edit/Audio/Text/Looks/Adjust sheets (Speed, Fades, Duration, Frame, Position, Sound, Adjust), Export panel (video, GIF, audio-only) and Export progress, More menu, Confirm dialog, Shortcut help (phone sheet), Media panel (narrow, vi), Unsupported screens (device-support), text editor and Done bar, preview during playback.

NOT covered by any axe or contrast run:
1. Dark theme. No axe run sets a colour scheme (only `host-integration.spec.ts` and the offline specs set dark, with no axe), so dark-theme contrast is covered only by the token arithmetic above.
2. Widths 390, 768 and 1920 px, and any landscape viewport. Only 320 and 1280 are scanned (some 800).
3. Wide-layout Shortcut help (`help-wide-*` exists as a screenshot only), the Notices dialog, and the privacy details dialog.
4. Drop overlay, drag-in-progress states, the "adding" progress notice, the export error and interrupted dialogs (check `export-ui.spec.ts` for failed states), and the Music picker at 320 px popover state.
5. The compact layout (700-999 px) with the resize grip.
6. Full-screen and maximised preview, compare hold, placement handles at 320 px, cross-fade popover at 320 px.
7. Canvas and gradient areas (axe skips them), reduced motion, forced colors, 200 % text size, 400 % zoom, and text-spacing overrides (1.4.12).
8. Anything axe cannot judge: focus order, reading order, live-region behaviour, whether announcements are sensible. No test asserts that an edit produces a status message, which would have caught M1.

Suggested cheap additions (do not run until the memory budget allows, one worker): a single spec looping `[390, 768, 1920] x [light, dark]` with `emulateMedia({colorScheme})` over the default, selected-clip and export states; a `reducedMotion: 'reduce'` check; and an assertion that Split sets `.tk-preview-status` text (after M1).

## 3. Manual pass owner must do (VoiceOver, macOS Safari and iOS Safari; max 15 steps)

Setup: VO on (Cmd+F5 on Mac, triple-click side button on iPhone). Use FLOW-01 with 3 short videos. Test en-US first, then switch to vi-VN for steps 4 and 8.

1. Mac: Land on the empty editor. VO should read the h1 "Clip Maker" or empty-state title, then Add media. Press Add media, pick 3 files; the "added" notice should be announced.
2. Mac: Use VO+U (rotor) to list landmarks, headings and form controls. Check duplicate names ("Timeline" three times, m1) and that toolbars read as toolbars.
3. Mac: Tab to the top toolbar, use Left/Right between buttons; Export reads as unavailable when it should.
4. Mac: Tab into the timeline. Each clip should read "name, length, toggle button, pressed or not". Press Enter to select. Check that Space plays and that you hear something (M1).
5. Mac: With a clip selected, step the playhead (Right, Shift+Right), press S to split. Is the split announced? Delete a clip; where does focus go and what is read?
6. Mac: Tab into the inspector. Move a slider (Speed, Brightness) with arrows; VO should read the value with a unit ("120 %"). Type in a number field and press Enter with a bad value (m2).
7. Mac: Open Looks; arrow through the tiles. Is "previewing <look>" read on each move, and is the checked state clear (m7)?
8. Mac: Add text (T). Type, press Esc or Mod+Enter, and check the count is announced near the limit. Switch language to vi-VN and check pronunciation of the labels.
9. Mac: Open Export (Mod+E). Choose 1080p, start. In the progress dialog check the percentage is announced politely and not on every tick; cancel and re-run to see the finished or failed message.
10. Mac: Press ? for the help dialog; Tab stays inside; Esc closes and focus returns to the opener.
11. iPhone portrait: Swipe through the top bar, preview, transport, timeline and tab bar. Check reading order is toolbar, preview, transport, timeline, tab bar, status bar.
12. iPhone: Try to move the playhead to about 0:10 and split there using only VoiceOver gestures (M3). Note the number of actions taken and whether the ruler can be reached.
13. iPhone: Open the Edit sheet by double-tapping the tab. Check the sheet title takes focus, tiles read their names, and Delete is clearly the destructive one. Close the sheet and check focus returns to its tab.
14. iPhone: Open More (three dots) then Keyboard shortcuts; the sheet should trap VO focus. Open the Media panel sheet (m12): can VO swipe reach the editor behind it?
15. iPhone: Rotate to landscape (M4). Check that the preview is visible, nothing needs sideways scrolling, and sheets can scroll. Repeat with Settings > Display > Larger Text at the largest size and Bold Text on, and with Reduce Motion on (momentum scroll, m5).

## 4. Items needing a manual pass beyond VoiceOver (cannot be settled from code or images)
- Real focus order and visible focus on every screen in both themes (static shots show one focus ring only).
- 200 % browser text zoom and 400 % page zoom at 1280 px (1.4.4, 1.4.10); text-spacing bookmarklet (1.4.12).
- Switch Control or Voice Control on iOS: "Tap <label>" works for every control (2.5.3), including unnamed icons that have only a `title`.
- Windows High Contrast or `forced-colors` emulation: selected states and trim handles stay visible.
