# Design fix round 2: brief

The round-1 fix brief still applies in full: `.build-my-app/reports/design-fix-brief.md`. That means local files only, NO publishing, no canvas.json edits, and fixed board sizes.

Read the round-2 findings:
- `.build-my-app/reports/design-review-round-2-audit.md` (0 blockers, 6 majors)
- `.build-my-app/reports/design-review-round-2-critique.md` (1 blocker, 5 majors)

## Updated specs (already applied; read them)
- **style.md, phone sheets:**
  - The transport (44 px) and a timeline peek (ruler plus main track, 76 px) ALWAYS stay visible above an open sheet. No sheet is open by default.
  - A sheet takes at most 40 % of the height, or 60 % when the tool is under 640 px tall. The body scrolls, including any message above a sticky footer. The export panel follows the same rule.
- **style.md, notices:**
  - One placement: preview bottom-centre on wide, above the transport on phones.
  - At most 2 notices at once, plus a "+N more" chip (COPY-notice.more).
  - Error lists show at most 3 items plus COPY-action.show_all.
  - A length-limited result is info, with an `accent` icon.
  - Error dialogs are titled with the outcome (COPY-export.failed_title, interrupted_title, no_space_title), in `danger`.
- **Trim handles:** now neutral. The `handle` token is #EFEAF8 dark and #16111F light, and the grip uses `bg`. The CSS variables in every board were already updated. Draw grips in `bg`, never mango, and never a mango handle.
- **Text editing:** COPY-action.done sits in the TOP bar while editing text, as in CMP-TextEditor. The quick style bar above the keyboard holds typeface, colour and style only.
- **More menu icon:** use the vertical kebab (three dots) everywhere, including CMP-Toolbar.
- **Wide inspector:** use the CMP-Inspector version (its tabs and its Adjust order) on EVERY screen and flow board.
- **Font picker:** the 2×2 tiles everywhere.

## Sample-data consistency
- Files: street.mov (0:37), sunset.mp4 (0:18), picnic.jpg (0:03).
- 1080p estimate: about 24 MB.
- Speed chips in vi-VN use a decimal comma (0,25×).

Report back (≤ 200 words): files changed, findings fixed (with IDs), and anything not fixed.
