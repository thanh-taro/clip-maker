# Review: QA fix batch 1 (accessibility)

Branch `worktree-agent-a2360c45e15d7ced1`, diff `c5e5b07..HEAD` (4 commits). The review read the code only. No e2e, build or `pnpm check` was run.
Checks run in the worktree: `pnpm test` reported 119 files and 1070 tests passed. `python3 tools/spec_lint.py` reported 0 errors and 0 warnings. `--coverage` lists no missing tests for F-002.AC9, F-002.AC10 or F-017.AC4, AC8–AC12.

Overall: QA-1, QA-2 and QA-7 are put in place as decided. The spec and copy changes are consistent: the new COPY IDs are used, and the Vietnamese is natural, has its diacritics and keeps the catalogue's `xoá` spelling. The key-scope change is small and sits in one place (`scopeOf` → `free`/`outside`, `isCharacterKey` in `resolveKey`). Every key binder goes through it. No binder bypasses the scope: the only other letter check is TextEditor's Mod+Z/Y.

## Critical
None.

## Major

### M1. Safari with a mouse: after clicking a text layer or audio clip, the letter shortcuts stop working
- **Where:** src/app/playback.ts:329 (`inShortcutArea`), src/keys/index.ts:126 (`!focus → 'outside'`), src/timeline/view.ts:907/971 (`.tk-tclip`/`.tk-aclip` are native `<button>`s in `.tk-text-lane`/`.tk-audio-lane`), view.ts:1757/1780 (pointerdown handlers don't focus).
- **Scenario:** In desktop Safari, a click does not focus a native `<button>`. Focus goes to the nearest mouse-focusable ancestor. For main-track clips that ancestor is `.tk-track` (tabIndex −1, inside `.tk-timeline`), so they work. Text and audio clips have no such ancestor, so `activeElement` becomes `body`. `focusInfo` then returns null, the scope is `outside`, and S (split the selected audio clip), I/O (trim it), M (mute it) and T do nothing right after the user click-selected the item. Before this batch these keys worked. Chromium is not affected because it focuses the button on click, so the e2e suite on Chromium won't show it. The e2e on WebKit may not show it either: trim-split.spec.ts:266 clicks a toolbar button before pressing S.
- **Fix:** In `onTextDown`/`onAudioDown` (with a mouse or pen), call `button.focus({ preventScroll: true })`. Alternatively, give `.tk-lanes` `tabIndex = -1` so Safari focuses inside `.tk-timeline`. Add a WebKit e2e test: click `.tk-aclip`, then press `KeyM` and expect it muted.

## Minor

### m1. Clicking the ruler may now move focus to it, which changes what the arrow keys do after a scrub
- **Where:** src/timeline/view.ts:1121 (`ruler.tabIndex = 0`), view.ts:1088 (`onRulerDown` calls `preventDefault()` on `pointerdown` only).
- **Scenario:** A user scrubs with the mouse, then presses Right to step one frame (RULE-20 *Playback*). If the click focused the ruler, the slider takes Right and moves 1 s instead. Calling `preventDefault` on `pointerdown` is not reliably enough to stop focus across engines; it depends on whether the compatibility `mousedown` is suppressed.
- **Fix:** Check this in both engines. If the ruler takes focus on click, also call `preventDefault()` on the ruler's `mousedown`, so pointer scrubbing never focuses it while Tab still does. Alternatively, accept the behaviour and say so in CMP-Timeline.

### m2. The ruler's value is rewritten on every playback tick, and a focused ruler is read aloud during playback
- **Where:** src/timeline/view.ts:1116–1131 (`stopRulerValue` effect).
- **Scenario:** The effect depends on `playhead`, so on every frame it sets `tabIndex`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`, and formats a string through `t()`. The new text is cheap but runs at about 60 Hz. More importantly, after Space on the focused ruler (which the AC10 test does), NVDA and VoiceOver read the value change of the focused slider about once a second, and `aria-valuenow` changes on every frame.
- **Fix:** Write only the values that changed: cache the last valuenow and valuetext, and set `tabIndex` and `aria-disabled` only when `has` changes. While the controller is playing, skip valuenow and valuetext and write them once on pause. The pause already announces the time through the status region.

### m3. `aria-invalid` stays set when the value changes some other way
- **Where:** src/app/NumberField.tsx:70–72 and the `invalid` state at :51.
- **Scenario:** Brightness is marked invalid after "abc". The user then drags the slider, undoes, or selects another clip while the same NumberField instance stays mounted. The field shows a valid new value but is still `aria-invalid="true"` and keeps the invalid styling. F-017.R8 says "until the next edit".
- **Fix:** In the `[value, …]` layout effect, clear `invalid` when the value changed and the change did not come from this field's own limited commit. A simple way is a ref that `commitValue` sets for the next render. The same applies to the GIF `TimeField` (src/app/ExportPanel.tsx:235), whose `shown` changes when the range is edited elsewhere.

### m4. `action.add_text` is listed as a step label but never used
- **Where:** src/app/announce.ts:33. Nothing calls `labelLastStep('action.add_text')`; the call would belong in src/app/text.ts:126 `addTextAndEdit`.
- **Scenario:** Press T, then undo. The announcement is "Undone: last edit", although the type suggests it should name the action.
- **Fix:** Label the step in `addTextAndEdit` once the layer is committed, or remove the entry from `StepLabel`. QA-7 allows "last edit", so either choice is fine; the dead entry is not.

### m5. The short-landscape layout isn't limited to phones, and the spec text differs from the CSS
- **Where:** src/app/styles/timeline.css:23 `@media (max-height: 480px)`, and specs/30-experience/components/CMP-Preview.md (the "short landscape phone" line).
- **Scenario:** A desktop window, or a portal iframe, shorter than 480 px at any width also switches to the scrolling editor with the preview row at at least 60 dvh. The spec says the layout is for a "short landscape phone" and that the "stage keeps at least a quarter of the height". It does not say the editor scrolls vertically, which is what QA-7 decided and the CSS does.
- **Fix:** Scope the query to phones, for example `(max-height: 480px) and (orientation: landscape) and (max-width: 999px)`, or combine it with the `tk-editor` container width. Update the CMP-Preview sentence to match QA-7 and the CSS: the editor scrolls vertically, the preview keeps most of the height, and an open sheet caps at 85 dvh. Otherwise, widen the spec on purpose to "any window under 480 px tall".

### m6. The 320 px transport has little room to spare
- **Where:** src/app/styles/preview.css:111–142.
- **Scenario:** Six 44 px buttons, 8 px of padding and the time "m:ss" take about 308 of 320 px. A project of 10 minutes or more ("12:34"), an hour-long time, or larger text (WCAG 1.4.4) pushes Full screen out of the row. The row has no shrink or overflow handling. The AC9 e2e test only checks a 6 s project.
- **Fix:** Let `.tk-transport .tk-time` shrink (`min-inline-size: 0; overflow: hidden; text-overflow: clip`), or hide the time below about 340 px. The status bar already shows it.

### m7. Test gap: F-017.AC8 in e2e
- **Where:** tests/e2e/a11y.spec.ts:114.
- **Scenario:** AC8 lists three starting points: "an inspector slider, the toolbar or no control". The e2e test covers the toolbar and no control. The slider case is only covered in unit tests (keys.scope.test.ts) and indirectly by the keyboard-touch walkthrough with T. That is acceptable, but naming the slider case in the AC8 test, with S and = from the Brightness slider, would make the AC traceable to one test.

## e2e specs not edited by the batch that press single-character keys
I searched every `.press`/`.down` with a letter, `Key*`, `=`, `-`, `?` or `\`, and the variable-key loops. Every hit in a spec the batch did not edit has focus inside the shortcut area, or doesn't check that the key acted:
- adjust.spec.ts:657–658: `Backslash` with focus on a clip, inside `.tk-timeline`. OK.
- music.spec.ts:544–547: `m` with focus on a timeline audio clip. OK.
- trim-split.spec.ts:273: `KeyS` after clicking a timeline toolbar button, inside `.tk-timeline`. OK. Lines 322 and 502 come after a clip click (Chromium focuses the clip; WebKit focuses `.tk-track`). Lines 341 and 344 come after `clip.focus()`. OK.
- host-integration.spec.ts:329 and 396: `KeyN` from `add-media` or `body`, and after a click in `.tk-timeline`. These only check that the key reached the tool's document (a capture listener), not that snapping toggled. They are unaffected.
- text.spec.ts:827: the `'t'`/`'s'` loop with focus on Done while editing. This is a negative test (`EDITING` → field). OK.

**None would now fail.** The specs that needed changes (keyboard-touch, text F-010.AC9, host-embedded) were updated.

## Checked and found correct
- **Dialogs, menus, text editing, IME:** `inDialog`, `editable` and `EDITING`/`LOCKED` win before `free`. `isComposing` is checked in every binder. Space, the arrows, Delete, Esc and Mod/Alt combinations keep their scope in `outside` (unit tests cover this).
- **Ruler keys vs the document playback keys:** the slider scope makes `resolveKey` return null for Arrow, Page, Home and End, and the ruler's handler calls `preventDefault`. Space on the ruler still plays. Home and End are consistent with `ctl.toEnd()`. Pointer scrubbing and keyboard moves both set `playhead` directly, the latest wins, and they don't fight.
- **Announcements:** only discrete actions announce: split, delete, duplicate, move by keys or buttons, mute (label only), undo/redo, Space-to-play and field commits. Drags, trims, scrubs, ruler keys and playback ticks don't announce. The no-break-space alternation repeats a message without leaving stale text.
- **Inert media sheet:** lifted by the effect cleanup on every close path (Close, Esc, any `panelOpen = false`), on a resize to wide (the `isNarrow` dependency) and on unmount. `closeAndReturn` lifts it before focusing the opener. `<dialog>` elements, the file input, the notice stack and the status region are left live. The ConfirmDialog and ShortcutHelp `<dialog>`s are not inert.
- **h1:** exactly one heading. EmptyState's `h1` is used while the project is empty, and the visually hidden `app.name` once it has media.
- **COPY:** every new ID is in copy.md and messages.gen.ts in both languages, and `timeline.ruler` and `announce.*` are used as the spec says.

Status: fixes
