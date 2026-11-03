# Design adapter — Claude Design canvas (Clip Maker)

Tool: a Claude Design artifact (live `.dc.html` artboards on a canvas), decision D-030 — same tool
and conventions as the taro-kit siblings (json-formatter, data-analysts-file-viewer). The canvas is
a **derived** artifact: the specs stay the source of truth. Canvas URL: recorded in
`.build-my-app/state.json` as `design_canvas_url`; source files are kept in `design/canvas/`.

## Naming
- Screen artboards: one per screen state (or flow step) and viewport, file
  `SCR-Editor_<state>_<viewport>.dc.html`, titled `SCR-Editor / <state> / <viewport>`.
  Theme is shown as two framed panels in each artboard (`.tk-dark` / `.tk-light`), so each artboard
  covers both themes.
- Components: one artboard per component, `CMP-<Name>.dc.html`, holding every row of its
  "Variants & states" table in both themes, each cell labeled `<CMP-ID> / <variant> / <theme>`.
- Flows: `FLOW-<nn>_step<n>.dc.html`.
- Entry artboard: `Main.dc.html` — SCR-Editor / selected / wide (FLOW-01 mid-edit).
- Viewports: **embedded** 1200 × 760 (portal tool area on desktop), **narrow** 390 × 844 (phone portrait,
  phone layout; NFR-07 minimum 320).

## Tokens
- Values come from `specs/30-experience/tokens.json`. In the app they become CSS custom properties
  `--tk-color-<role>`, `--tk-space-<n>`, `--tk-radius-<name>`, `--tk-font-<role>`, `--tk-size-<name>`
  (dark on `:root`, light under `[data-theme="light"]`), per `adapters/codegen.md`.
- Artboards declare colour roles as short custom properties scoped to `.tk-dark` / `.tk-light`
  (`--bg`, `--fg`, `--accent`, `--workArea`, `--checkerA`, `--selectionOutline`, …) and the
  the text-layer palette as `--txt-white` … `--txt-pink` (RULE-11 text palette). **Every value must equal tokens.json.**
  A value with no token is a design-auditor finding.

## Copy
- Every visible UI string comes from `specs/30-experience/copy.md` (en-US); each text element
  carries `data-copy="<COPY-ID>"`. Sample content (the media in the preview, clip names, the user's
  text layers such as "Đà Lạt 2026") is the only text without a COPY ID and is marked
  `data-sample`.
- On an element whose name is an `aria-label` (icon buttons, regions, radiogroups, dialogs),
  `data-copy` names the COPY ID of that label, not of the visible text inside it.
  Visually hidden text (`.sr`) carries its own `data-copy`.
- At least one artboard per region shows vi-VN text (`lang="vi"`) to check length (F-022.R6).

## Sample media
Made-up content drawn in HTML/CSS inside the artboard: a sunset-over-water 9:16 clip, a city street
16:9 clip, a family-picnic photo (shapes only, no real people or brands), and the text layer
"Đà Lạt 2026". Music titles come from the bundled-music list once chosen (placeholders marked
`data-sample`). Sample content is the only text without a COPY ID and is marked `data-sample`.

## Viewports
- **wide** 1200 × 760 (the portal tool area on desktop), dark and light panels.
- **narrow** 390 × 844 (phone portrait; NFR-07 minimum is 320), dark and light panels.
- **compact** 820 × 760 for key states only (default, selected).

## Review
Each artboard's title links its spec ID. The design-auditor checks coverage (state × viewport ×
theme), COPY IDs and tokens; the ui-critic reviews screenshots; the a11y-auditor checks contrast,
targets and reading order. Token pairs are already validated (`tools/token_contrast.py`).
