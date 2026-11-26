# F-028 Colour replace UI review

Reviewed: the 11 PNGs in `.claude/worktrees/agent-aef0c24b74c7cc705/.build-my-app/reports/screens/F-028/`, compared with `screens/F-024..F-027`, `review-d053-ui.md`, `style.md`, `tokens.json`, CMP-Preview (picking a colour), CMP-Inspector (colour replace), and F-028. These are static shots, so hit areas are estimated from drawn size. All paths below are relative to the F-028 screens folder.

## Major

1. **On narrow, the pick pill covers the top quarter of the picture.** Files: `pick-mode-narrow-en-US.png`, `pick-mode-narrow-vi-VN.png`. At 320 px the picture is about 180x100 px, and the pill (y 52-78) sits on top of it. That strip can't be picked, and it is often where the sky or other target colours are. The spec also says the pill wraps to two lines under 400 px, which would cover even more (the build does not wrap it today).
   Fix (spec change to CMP-Preview): under 400 px, place the pill over the playback row below the preview. Use the same `chrome` pill recipe, height `size.touchTarget`. Keep the top-left corner only on wide.

2. **Cancel is too small to tap on narrow.** Files: `pick-mode-narrow-*.png`. Cancel is a text link about 26 px tall. It is the only visible way out of pick mode on a phone.
   Fix: when the pointer is coarse, make Cancel a button with a hit area of at least `size.touchTarget` (44 px) using padding or a ::before. Keep it in `accent` text with a `space.2` gap from the hint.

3. **The magnifier is hard to see and does not match the spec.** File: `magnifier-wide-en-US.png`. It has a thin white outer rim and a thin white 1 px centre ring. On a white or pale picture both disappear. The spec asks for a centre ring "in the colour a lift would pick". Here it is white, and over flat blue the shot cannot show any enlargement.
   Fix:
   - Outer rim: 3 px white with a 1 px `color.light.fg` hairline outside it, plus the `chrome` shadow.
   - Centre: a 4 px ring filled with the sampled colour, with 1 px white and 1 px `fg` hairlines inside and outside.
   - Re-shoot over a detailed photo and over a white area.

4. **Nothing tells the user to set To when it still equals From.** Files: `inspector-replace-wide-*.png`, `sheet-replace-narrow-*.png`. Per Q6, a new card starts with To equal to From. Both swatches and hex values are identical, but the header already says "Changed". After picking, the user sees no change and may think the tool failed.
   Fix (copy and spec change): while To equals From, draw the To button with a dashed `lineStrong` border. In place of the hex, show `COPY-replace.to_unset` ("Choose a colour" / "Chọn màu mới") in `muted`. Optionally, open CMP-ColourPicker for To right after an Add pick.

5. **Pick mode does not say that the picture is shown ungraded.** Files: `pick-mode-*`, `pick-keys-*`, `magnifier-*`. RULE-25 hides the look and all adjustments while picking, so on a graded clip the picture suddenly changes. The pill gives no reason, unlike the Compare pill, which names its state. The fixture has no grade, so the shots cannot show this.
   Fix (copy change): extend `COPY-replace.picking` to "...Showing original colours." (or add a second `font.size.xs` `muted` line). Re-shoot with a look and Contrast turned on.

## Minor

6. **The keyboard marker blends into blue and purple pictures.** Files: `pick-keys-wide-*.png`. It has an `accent2`/`focus` ring around a white ring, and it is about 24 px across. Fix: add a 1 px `fg` outer hairline, and keep it at least `size.targetMin`.

7. **The pressed state looks different on wide and narrow.** On wide, Pick from preview pressed (`pick-mode-wide-en-US.png`) has only an `accent` border. On narrow (`pick-mode-narrow-en-US.png`) it has a `selection` fill plus the `accent` border. Fix: use one recipe, `selection` fill and `accent` border with `aria-pressed`, as in finding 4 of `review-d053-ui.md`.

8. **No screenshot shows the 3-card limit.** None of the shots has three cards with Add unavailable and `COPY-replace.limit` shown, so the limit's clarity can't be judged. Add `inspector-replace-limit-wide-*` and `sheet-replace-limit-narrow-*` shots. The limit text should sit directly under the disabled Add button in `font.size.sm` `muted`.

9. **On narrow, the group header, help text and Reset are scrolled out of view.** Files: `sheet-replace-narrow-*.png`. The sheet opens at "Colour 1", so the "matches colour, not objects" help text (R7) is never visible next to the card, and Range is hidden under the footer.
   Fix: when Add or Pick scrolls a card into view, align the group header to the top instead (scroll-margin-top equal to the header height). The wide placement, with the help text under the title and above the cards, is correct and should stay.

10. **On wide, Remove looks as strong as the main actions.** Files: `inspector-replace-wide-*.png`. With two cards there are two outlined "Remove" buttons that weigh as much as Pick from preview. Fix: make Remove a quiet ghost button with a `muted` icon and text (with `danger` on hover), height `size.control`.

11. **The vi-VN help text wraps to three lines on wide.** File: `inspector-replace-wide-vi-VN.png`. "giữ." is left alone on the last line. Fix: shorten the text to "Thay mọi chỗ có màu này, không riêng một vật. Giữ nguyên độ sáng và bóng." or add `text-wrap: pretty`.
    The narrow vi-VN tab bar and footer wrapping already existed in F-025 and are not caused by F-028.

12. **The From→To arrow is too faint.** It is about 12 px in a light grey. Fix: 16 px in `muted`, `aria-hidden`.

## Keep (use the same patterns elsewhere)
- The group header recipe (sentence-case semibold title, Changed dot, separate Reset) matches F-024..F-027.
- The Range and Softness rows (label, slider, field, and a reset icon only when the value is not the default) use F-007's columns.
- From, arrow and To fit on one row at 320 px, including vi-VN ("Từ màu" / "Sang màu").
- The placement handles are hidden in pick mode, and the pill uses the same recipe as the Compare pill.
