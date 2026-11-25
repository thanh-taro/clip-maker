---
id: CMP-StatusBar
title: Status bar
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.scrim, color.dark.success, color.dark.surface, color.dark.surface2, color.light.accent, color.light.bg, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.scrim, color.light.success, color.light.surface, color.light.surface2, font.family.body, font.family.mono, font.size.2xs, font.size.md, font.size.sm, font.size.xs, radius.md, radius.pill, radius.sm, size.icon.md, size.icon.sm, size.popover, size.statusbar, size.targetMin, size.touchTarget, space.0_5, space.1, space.1_5, space.2, space.2_5, space.3, space.3_5, space.4]
---

## Purpose
Privacy statement, source link and project facts.

## Anatomy
Privacy badge (COPY-privacy.badge); source link (COPY-privacy.source_label); project facts (COPY-status.facts).

## Variants & states
| Variant / state | Description |
|---|---|
| wide | Status-bar height row: privacy badge button (success dot and COPY-privacy.badge), the source link COPY-privacy.source_label with an external-link icon, and COPY-status.facts (aspect, frame rate, length as m:ss) in mono on the right. |
| narrow | The one-line status row under the tab bar (D-038), status-bar height: shield icon and COPY-privacy.badge at the smallest type size, kept fully visible down to the minimum width (F-020.AC1, also in vi-VN), and an icon-only source link named COPY-privacy.source_label. Both targets extend their hit area to touch size into the bottom safe area. Project facts are hidden (the length is in the transport). |
| privacy details open | Popover above the badge, at most the popover width: heading COPY-privacy.badge, COPY-privacy.details, the outlined action COPY-privacy.notices and close; the badge shows as pressed. |
| licence notices view | In-tool dialog COPY-privacy.notices_title with back (COPY-action.back) and close; sections COPY-notices.fonts and COPY-notices.code, each a table of COPY-notices.col_title, COPY-notices.col_source and COPY-notices.col_licence, listing every shipped dependency and typeface (no music, D-052). |

## Behavior
- The badge is always visible (F-020.R1) and opens the privacy details; Esc, close or a click outside dismiss them (F-020.AC2).
- The source link opens the repository in a new tab with no opener and no referrer and doesn't touch the session (F-020.R3); if the host blocks new tabs it does nothing.
- COPY-privacy.notices opens the notices view inside the tool, offline and without a new tab (F-020.R4); back returns to the details. On narrow widths the More menu also opens it.
- On SCR-Unsupported the bar shows only the badge and source link.

## Accessibility
- The bar is the page footer; the badge is a button that reports its expanded state and opens a dialog.
- The icon-only source link has an accessible name (COPY-privacy.source_label); external opening is indicated by an icon for sighted users and by the link's name.
- The notices view is a modal dialog with real table headers; focus returns to the badge when it closes.
- Narrow targets meet RULE-21 (NFR-06) through their extended hit areas; text never goes below the smallest type size.
